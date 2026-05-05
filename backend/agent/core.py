"""LangGraph agent core with Human-in-the-loop support.

Builds a ReAct-style agent graph that:
  1. Calls the LLM with conversation history
  2. Checks if tool calls need human approval → pauses if needed
  3. Executes approved tools
  4. Loops back to LLM until a final answer
"""

from __future__ import annotations

import uuid
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph

from agent.hitl import (
    check_tool_needs_approval,
    create_pending,
    get_pending,
)
from agent.llm import get_chat_model
from agent.schemas import AgentState, ModelConfig
from agent.skills import get_active_skills_instructions
from agent.tools import get_tools


# ── Graph node: call LLM ───────────────────────────────────────────

def call_model(state: AgentState, config: RunnableConfig) -> dict:
    """Invoke the LLM with current messages. Returns the response."""
    model_config: ModelConfig = config["configurable"].get("model_config", ModelConfig())
    system_prompt: str = config["configurable"].get("system_prompt", "You are a helpful AI assistant.")

    llm_kwargs = dict(
        provider=model_config.provider,
        model=model_config.model,
        temperature=model_config.temperature,
        max_tokens=model_config.max_tokens,
    )
    if model_config.api_key:
        llm_kwargs["api_key"] = model_config.api_key
    if model_config.base_url:
        llm_kwargs["base_url"] = model_config.base_url

    llm = get_chat_model(**llm_kwargs).bind_tools(get_tools())

    messages = [SystemMessage(content=system_prompt)]

    # Collect all tool_call_ids that have matching tool messages, so we can
    # strip unmatched tool_calls from assistant messages (needed when HITL
    # intercepts some tool calls before execution).
    executed_ids: set = set()
    for m in state["messages"]:
        if m.get("role") == "tool" and m.get("tool_call_id"):
            executed_ids.add(m["tool_call_id"])

    for msg in state["messages"]:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            content = msg.get("content", "")
            tc = msg.get("tool_calls")
            # Only include tool_calls that have matching tool messages
            if tc and executed_ids:
                tc = [t for t in tc if t.get("id") in executed_ids]
            # Reconstruct AIMessage, preserving extra fields needed by
            # reasoning models (DeepSeek requires reasoning_content to be
            # passed back alongside tool_calls).
            ai_kwargs: dict = {"content": content}
            if tc:
                ai_kwargs["tool_calls"] = [
                    {"name": t["name"], "args": t["args"], "id": t["id"]}
                    for t in tc
                ]
            # Pass through extra fields via additional_kwargs
            # (reasoning_content for DeepSeek reasoning models)
            extra: dict = {}
            for k in ("reasoning_content",):
                if k in msg:
                    extra[k] = msg[k]
                    print(f"🧠 Passing back {k} ({len(str(msg[k]))} chars)")
            if extra:
                ai_kwargs["additional_kwargs"] = extra
            messages.append(AIMessage(**ai_kwargs))
        elif msg["role"] == "tool":
            messages.append(ToolMessage(content=msg["content"], tool_call_id=msg["tool_call_id"]))

    response = llm.invoke(messages, config)

    tool_calls = []
    if hasattr(response, "tool_calls") and response.tool_calls:
        tool_calls = [
            {"name": tc["name"], "args": tc["args"], "id": tc["id"]}
            for tc in response.tool_calls
        ]

    # Build assistant message, preserving reasoning_content for DeepSeek
    asst_msg: dict = {"role": "assistant", "content": response.content}
    if tool_calls:
        asst_msg["tool_calls"] = [
            {"type": "tool_call", "name": tc["name"], "args": tc["args"], "id": tc["id"]}
            for tc in tool_calls
        ]
    # Copy extra fields (reasoning_content) from the response
    extras = getattr(response, "additional_kwargs", {}) or {}
    for k in ("reasoning_content",):
        if k in extras:
            asst_msg[k] = extras[k]
            print(f"🧠 Stored {k} ({len(str(extras[k]))} chars) in assistant message")

    return {
        "messages": [asst_msg],
        "tool_calls": tool_calls,
        "next": "check_approval" if tool_calls else END,
    }


# ── Graph node: check human approval ───────────────────────────────

def check_approval(state: AgentState, config: RunnableConfig) -> dict:
    """Intercept tool calls and pause if human approval is required.

    Returns a special state that the API layer detects and translates
    into a pending-approval response to the frontend.
    """
    # If skip_approval is set (resume after approval), bypass all checks
    if config["configurable"].get("skip_approval", False):
        print("⏭️ Skipping approval checks (resume flow)")
        return {
            "tool_calls": state["tool_calls"],
            "pending_approvals": [],
            "next": "tools",
        }

    pending_list = []
    safe_calls = []

    thread_id = config["configurable"].get("thread_id", "unknown")
    mc = config["configurable"].get("model_config", {})
    mc_dict = {"provider": mc.provider, "model": mc.model, "temperature": mc.temperature, "max_tokens": mc.max_tokens}
    if hasattr(mc, "api_key") and mc.api_key:
        mc_dict["api_key"] = mc.api_key
    if hasattr(mc, "base_url") and mc.base_url:
        mc_dict["base_url"] = mc.base_url

    for tc in state["tool_calls"]:
        if check_tool_needs_approval(tc["name"], tc["args"]):
            pending_id = create_pending(
                thread_id=thread_id,
                tool_name=tc["name"],
                tool_args=tc["args"],
                tool_call_id=tc["id"],
                explanation=f"The agent wants to call **{tc['name']}** with:\n```json\n{tc['args']}\n```",
                model_config=mc_dict,
            )
            pending_list.append({
                "pending_id": pending_id,
                "tool_name": tc["name"],
                "tool_args": tc["args"],
                "tool_call_id": tc["id"],
            })
        else:
            safe_calls.append(tc)

    if pending_list:
        return {
            "tool_calls": safe_calls,
            "pending_approvals": pending_list,
            "next": "tools" if safe_calls else END,
        }

    # No pending approvals — proceed normally
    return {
        "tool_calls": state["tool_calls"],
        "pending_approvals": [],
        "next": "tools",
    }


# ── Graph node: execute tools ──────────────────────────────────────

def execute_tools(state: AgentState) -> dict:
    """Execute pending tool calls and return results."""
    tools = {t.name: t for t in get_tools()}
    outputs = []

    for tc in state["tool_calls"]:
        tool_fn = tools.get(tc["name"])
        if tool_fn is None:
            result = f"Unknown tool: {tc['name']}"
        else:
            try:
                result = tool_fn.invoke(tc["args"])
            except Exception as e:
                result = f"Tool error: {e}"

        outputs.append({
            "role": "tool",
            "content": str(result),
            "tool_call_id": tc["id"],
        })

    return {
        "messages": outputs,
        "tool_outputs": outputs,
        "next": "agent",
    }


# ── Build the graph ────────────────────────────────────────────────

def build_agent() -> StateGraph:
    """Construct the LangGraph agent with HITL safety check.

    Graph structure::

        agent → check_approval ──needs approval?──→ END (with pending)
                   │
                   └──safe──→ tools → agent (loop)
    """
    workflow = StateGraph(AgentState)

    workflow.add_node("agent", call_model)
    workflow.add_node("check_approval", check_approval)
    workflow.add_node("tools", execute_tools)

    workflow.set_entry_point("agent")
    # agent → check_approval (when tool_calls) or END
    workflow.add_conditional_edges("agent", lambda s: s["next"])
    # check_approval → tools (when safe) or END (when paused for approval)
    workflow.add_conditional_edges("check_approval", lambda s: s["next"])
    workflow.add_edge("tools", "agent")

    return workflow.compile()


# ── Run agent (single message, no HITL pause) ──────────────────────

async def run_agent(
    message: str,
    model_config: ModelConfig | None = None,
    system_prompt: str | None = None,
    thread_id: str | None = None,
) -> tuple[str, str, list | None]:
    """Run the agent and return (response, thread_id, pending_approvals).

    If the agent needs human approval, ``pending_approvals`` will be a
    non-empty list and ``response`` will be an empty string.

    Call ``resume_with_approval()`` to continue after the user decides.
    """
    if model_config is None:
        model_config = ModelConfig()
    if thread_id is None:
        thread_id = uuid.uuid4().hex[:12]

    agent = build_agent()
    config = {
        "configurable": {
            "thread_id": thread_id,
            "model_config": model_config,
            "system_prompt": (system_prompt or "You are a helpful AI assistant.") + get_active_skills_instructions(),
        }
    }

    initial_state: AgentState = {
        "messages": [{"role": "user", "content": message}],
        "next": "agent",
        "tool_calls": [],
        "tool_outputs": [],
        "pending_approvals": [],
    }

    final_state = await agent.ainvoke(initial_state, config)

    # If the graph paused for approval
    pending = final_state.get("pending_approvals", [])
    if pending:
        return "", thread_id, pending

    # Extract the final assistant message
    for msg in reversed(final_state["messages"]):
        if msg["role"] == "assistant":
            return msg["content"], thread_id, None

    return "No response generated.", thread_id, None


# ── Resume after approval ─────────────────────────────────────────

async def resume_with_approval(
    pending_id: str,
    thread_id: str,
    model_config: ModelConfig | None = None,
    system_prompt: str | None = None,
) -> tuple[str, list | None]:
    """Continue agent execution after the user's approval decision.

    The approval result is injected as a tool result, and the agent
    continues its loop.  Returns (response_text, pending_approvals).
    """
    pending = get_pending(pending_id)
    if pending is None:
        return "Approval request expired.", None
    if pending["status"] == "pending":
        return "Approval not yet resolved.", None

    # Build a user-facing description of the approval decision
    tool_args = pending.get("edited_args") or pending["tool_args"]
    if pending["status"] == "approved":
        approval_note = (
            f"The user APPROVED calling `{pending['tool_name']}` "
            f"with arguments: {tool_args}. "
            f"Proceed as if {pending['tool_name']} was called successfully."
        )
    elif pending["status"] == "rejected":
        approval_note = (
            f"The user REJECTED calling `{pending['tool_name']}` "
            f"with arguments: {tool_args}. Skip this tool call and continue."
        )
    else:
        approval_note = (
            f"The user EDITED the call to `{pending['tool_name']}`. "
            f"New arguments: {tool_args}. Proceed with these arguments."
        )

    if model_config is None:
        model_config = ModelConfig()
    if system_prompt is None:
        system_prompt = "You are a helpful AI assistant."

    agent = build_agent()
    config = {
        "configurable": {
            "thread_id": thread_id,
            "model_config": model_config,
            "system_prompt": system_prompt + get_active_skills_instructions(),
            "skip_approval": True,
        }
    }

    # Instead of reconstructing tool_call chains (which causes API errors),
    # we tell the agent about the approval as a user/system instruction.
    initial_state: AgentState = {
        "messages": [
            {"role": "user", "content": f"[System: {approval_note}]"},
        ],
        "next": "agent",
        "tool_calls": [],
        "tool_outputs": [],
        "pending_approvals": [],
    }

    final_state = await agent.ainvoke(initial_state, config)

    pending2 = final_state.get("pending_approvals", [])
    if pending2:
        return "", pending2

    for msg in reversed(final_state["messages"]):
        if msg["role"] == "assistant":
            return msg["content"], None

    return "No response generated.", None


async def resume_with_multiple_approvals(
    pending_ids: list[str],
    thread_id: str,
    model_config: ModelConfig | None = None,
    system_prompt: str | None = None,
) -> tuple[str, list | None]:
    """Approve ALL pending tool calls at once and run the agent once.

    Resolves each pending_id as "approved", builds a combined approval
    note, and runs the agent with ``skip_approval=True``.
    """
    from agent.hitl import get_pending, resolve_pending

    notes = []
    mc_data = None

    for pid in pending_ids:
        resolve_pending(pid, "approve")
        pending = get_pending(pid)
        if pending is None:
            continue
        if mc_data is None:
            mc_data = pending.get("model_config", {})
        notes.append(
            f"The user APPROVED calling `{pending['tool_name']}` "
            f"with arguments: {pending.get('edited_args') or pending['tool_args']}. "
            f"Proceed as if it was called successfully."
        )

    if not notes:
        return "No pending approvals found.", None

    combined_note = "\n".join(notes)

    if model_config is None and mc_data:
        model_config = ModelConfig(
            provider=mc_data.get("provider", "anthropic"),
            model=mc_data.get("model", ""),
            api_key=mc_data.get("api_key", ""),
            base_url=mc_data.get("base_url", ""),
        )
    if model_config is None:
        model_config = ModelConfig()
    if system_prompt is None:
        system_prompt = "You are a helpful AI assistant."

    agent = build_agent()
    config = {
        "configurable": {
            "thread_id": thread_id,
            "model_config": model_config,
            "system_prompt": system_prompt + get_active_skills_instructions(),
            "skip_approval": True,
        }
    }

    initial_state: AgentState = {
        "messages": [{"role": "user", "content": f"[System: {combined_note}]"}],
        "next": "agent",
        "tool_calls": [],
        "tool_outputs": [],
        "pending_approvals": [],
    }

    final_state = await agent.ainvoke(initial_state, config)

    pending2 = final_state.get("pending_approvals", [])
    if pending2:
        return "", pending2

    for msg in reversed(final_state["messages"]):
        if msg["role"] == "assistant":
            return msg["content"], None

    return "No response generated.", None
