"""LangGraph agent with Human-in-the-loop support."""

from __future__ import annotations

import uuid
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph

from core.llm import get_chat_model
from core.state import AgentState, ModelConfig
from core.tools import get_tools, SENSITIVE_TOOLS, get_todo_prompt
from core.memory import format_memory_context
from services.threads import get_history, add_messages
from services.hitl import create_pending, get_pending, resolve_pending
from services.skills import get_active_skills_instructions


def _build_system_prompt(user_prompt: str | None = None) -> str:
    """Build the full system prompt including skills, memory, and todo instructions."""
    base = user_prompt or "You are a helpful AI assistant."

    # Memory usage instructions
    memory_guide = (
        "\n\n## Cross-Session Memory\n"
        "You can save what you learn using `save_observation` so it persists across sessions."
        "\nGood times to save:"
        "\n- The user corrects your approach → save as type='feedback'"
        "\n- You learn the user's preferences or role → type='user'"
        "\n- Important project decisions or context → type='project'"
        "\n- Where to find external info → type='reference'"
        "\nYou can also use `recall_memories` to proactively look up past learnings."
    )

    return base + memory_guide + get_active_skills_instructions() + get_todo_prompt()
from services.hitl import create_pending, get_pending, resolve_pending
from services.skills import get_active_skills_instructions
from core.memory import format_memory_context


# ── Graph node: call LLM ───────────────────────────────────────────

def call_model(state: AgentState, config: RunnableConfig) -> dict:
    mc: ModelConfig = config["configurable"].get("model_config", ModelConfig())
    sp: str = config["configurable"].get("system_prompt") or _build_system_prompt()

    # Inject relevant cross-session memories based on last user message
    for m in reversed(state["messages"]):
        if m.get("role") == "user" and m.get("content"):
            mem_context = format_memory_context(str(m["content"]))
            if mem_context:
                sp += mem_context
            break

    llm_kw = dict(provider=mc.provider, model=mc.model, temperature=mc.temperature, max_tokens=mc.max_tokens)
    if mc.api_key:
        llm_kw["api_key"] = mc.api_key
    if mc.base_url:
        llm_kw["base_url"] = mc.base_url
    llm = get_chat_model(**llm_kw).bind_tools(get_tools())

    msgs = [SystemMessage(content=sp)]

    # Inject relevant cross-session memories based on last user message
    for m in reversed(state["messages"]):
        if m.get("role") == "user" and m.get("content"):
            mem_context = format_memory_context(str(m["content"]))
            if mem_context:
                sp += mem_context
            break

    # Collect tool_call_ids that have matching tool messages
    executed_ids: set = set()
    for m in state["messages"]:
        if m.get("role") == "tool" and m.get("tool_call_id"):
            executed_ids.add(m["tool_call_id"])

    for m in state["messages"]:
        if m["role"] == "user":
            msgs.append(HumanMessage(content=m["content"]))
        elif m["role"] == "assistant":
            tc = m.get("tool_calls")
            if tc and executed_ids:
                tc = [t for t in tc if t.get("id") in executed_ids]
            ai_kw: dict = {"content": m.get("content", "")}
            if tc:
                ai_kw["tool_calls"] = [{"name": t["name"], "args": t["args"], "id": t["id"]} for t in tc]
            extra: dict = {}
            for k in ("reasoning_content",):
                if k in m:
                    extra[k] = m[k]
            if extra:
                ai_kw["additional_kwargs"] = extra
            msgs.append(AIMessage(**ai_kw))
        elif m["role"] == "tool":
            msgs.append(ToolMessage(content=m["content"], tool_call_id=m["tool_call_id"]))

    response = llm.invoke(msgs, config)
    tool_calls = []
    if hasattr(response, "tool_calls") and response.tool_calls:
        tool_calls = [{"name": tc["name"], "args": tc["args"], "id": tc["id"]} for tc in response.tool_calls]

    asst_msg: dict = {"role": "assistant", "content": response.content}
    if tool_calls:
        asst_msg["tool_calls"] = [{"type": "tool_call", "name": tc["name"], "args": tc["args"], "id": tc["id"]} for tc in tool_calls]
    extras = getattr(response, "additional_kwargs", {}) or {}
    for k in ("reasoning_content",):
        if k in extras:
            asst_msg[k] = extras[k]

    return {"messages": [asst_msg], "tool_calls": tool_calls, "next": "check_approval" if tool_calls else END}


# ── Graph node: check human approval ───────────────────────────────

def check_approval(state: AgentState, config: RunnableConfig) -> dict:
    if config["configurable"].get("skip_approval", False):
        return {"tool_calls": state["tool_calls"], "pending_approvals": [], "next": "tools"}

    pending_list, safe_calls = [], []
    tid = config["configurable"].get("thread_id", "unknown")
    mc = config["configurable"].get("model_config", {})
    mc_d = {"provider": mc.provider, "model": mc.model, "temperature": mc.temperature, "max_tokens": mc.max_tokens}
    if hasattr(mc, "api_key") and mc.api_key:
        mc_d["api_key"] = mc.api_key
    if hasattr(mc, "base_url") and mc.base_url:
        mc_d["base_url"] = mc.base_url

    for tc in state["tool_calls"]:
        name = tc["name"]
        if name in SENSITIVE_TOOLS:
            pid = create_pending(thread_id=tid, tool_name=name, tool_args=tc["args"], tool_call_id=tc["id"], model_config=mc_d)
            pending_list.append({"pending_id": pid, "tool_name": name, "tool_args": tc["args"], "tool_call_id": tc["id"]})
        else:
            safe_calls.append(tc)

    if pending_list:
        return {"tool_calls": safe_calls, "pending_approvals": pending_list, "next": "tools" if safe_calls else END}
    return {"tool_calls": state["tool_calls"], "pending_approvals": [], "next": "tools"}


# ── Graph node: execute tools ──────────────────────────────────────

def execute_tools(state: AgentState) -> dict:
    tools = {t.name: t for t in get_tools()}
    outputs = []
    for tc in state["tool_calls"]:
        fn = tools.get(tc["name"])
        result = fn.invoke(tc["args"]) if fn else f"Unknown tool: {tc['name']}"
        try:
            result = fn.invoke(tc["args"]) if fn else f"Unknown tool: {tc['name']}"
        except Exception as e:
            result = f"Tool error: {e}"
        outputs.append({"role": "tool", "content": str(result), "tool_call_id": tc["id"]})
    return {"messages": outputs, "tool_outputs": outputs, "next": "agent"}


# ── Build graph ────────────────────────────────────────────────────

def build_agent() -> StateGraph:
    wf = StateGraph(AgentState)
    wf.add_node("agent", call_model)
    wf.add_node("check_approval", check_approval)
    wf.add_node("tools", execute_tools)
    wf.set_entry_point("agent")
    wf.add_conditional_edges("agent", lambda s: s["next"])
    wf.add_conditional_edges("check_approval", lambda s: s["next"])
    wf.add_edge("tools", "agent")
    return wf.compile()


# ── Run agent ──────────────────────────────────────────────────────

async def run_agent(message: str, model_config: ModelConfig | None = None, system_prompt: str | None = None, thread_id: str | None = None) -> tuple[str, str, list | None]:
    if model_config is None:
        model_config = ModelConfig()
    if thread_id is None:
        thread_id = uuid.uuid4().hex[:12]

    # Load conversation history for context
    history = get_history(thread_id)
    initial_msgs = history + [{"role": "user", "content": message}] if history else [{"role": "user", "content": message}]

    agent = build_agent()
    config = {"configurable": {"thread_id": thread_id, "model_config": model_config, "system_prompt": _build_system_prompt(system_prompt)}}
    state = await agent.ainvoke(AgentState(messages=initial_msgs, next="agent", tool_calls=[], tool_outputs=[], pending_approvals=[]), config)

    pending = state.get("pending_approvals", [])
    if pending:
        return "", thread_id, pending

    # Save only new messages (skip previously saved history)
    history_len = len(history)
    new_msgs = [{"role": "user", "content": message}]
    for i, m in enumerate(state["messages"]):
        if i < history_len:
            continue  # already saved from previous turns
        d = m if isinstance(m, dict) else {}
        if d.get("role") in ("assistant",):
            content = str(d.get("content", ""))[:500]
            if content:
                new_msgs.append({"role": "assistant", "content": content})
    if len(new_msgs) > 1:
        add_messages(thread_id, new_msgs)

    for m in reversed(state["messages"]):
        d = m if isinstance(m, dict) else {}
        if d.get("role") == "assistant":
            return d.get("content", ""), thread_id, None
    return "No response.", thread_id, None


# ── Resume after approval ─────────────────────────────────────────

async def resume_with_approval(pending_id: str, thread_id: str, model_config: ModelConfig | None = None, system_prompt: str | None = None) -> tuple[str, list | None]:
    pending = get_pending(pending_id)
    if pending is None:
        return "Approval expired.", None
    if pending["status"] == "pending":
        return "Not yet resolved.", None

    args = pending.get("edited_args") or pending["tool_args"]

    if pending["status"] == "approved":
        # Execute the tool and pass result as a user message to avoid
        # DeepSeek reasoning_content issues with synthetic tool_call chains.
        tools = {t.name: t for t in get_tools()}
        fn = tools.get(pending["tool_name"])
        if fn:
            try:
                result = fn.invoke(args)
            except Exception as e:
                result = f"Tool error: {e}"
        else:
            result = f"Unknown tool: {pending['tool_name']}"
        status_msg = f"[Tool '{pending['tool_name']}' was approved and executed. Result: {str(result)[:800]}]"
    elif pending["status"] == "rejected":
        status_msg = f"[The user REJECTED calling `{pending['tool_name']}` with: {args}. Skip.]"
    else:
        status_msg = f"[The user EDITED `{pending['tool_name']}`. New args: {args}. Proceed.]"

    if model_config is None:
        model_config = ModelConfig()
    sp = _build_system_prompt(system_prompt)

    agent = build_agent()
    config = {"configurable": {"thread_id": thread_id, "model_config": model_config, "system_prompt": sp, "skip_approval": True}}
    state = await agent.ainvoke(AgentState(messages=[{"role": "user", "content": status_msg}], next="agent", tool_calls=[], tool_outputs=[], pending_approvals=[]), config)

    # Save thread context
    ctx_msgs = []
    for m in state["messages"]:
        d = m if isinstance(m, dict) else {}
        if d.get("role") in ("assistant",):
            ctx_msgs.append({"role": d["role"], "content": str(d.get("content", ""))[:500]})
    if ctx_msgs:
        add_messages(thread_id, ctx_msgs)

    p2 = state.get("pending_approvals", [])
    if p2:
        return "", p2
    for m in reversed(state["messages"]):
        d = m if isinstance(m, dict) else {}
        if d.get("role") == "assistant":
            return d.get("content", ""), None
    return "No response.", None


async def resume_with_multiple_approvals(pending_ids: list[str], thread_id: str, model_config: ModelConfig | None = None, system_prompt: str | None = None) -> tuple[str, list | None]:
    mc_data = None
    results_note = []

    for pid in pending_ids:
        resolve_pending(pid, "approve")
        p = get_pending(pid)
        if p is None:
            continue
        if mc_data is None:
            mc_data = p.get("model_config", {})

        args = p.get("edited_args") or p["tool_args"]
        tools = {t.name: t for t in get_tools()}
        fn = tools.get(p["tool_name"])
        if fn:
            try:
                result = fn.invoke(args)
            except Exception as e:
                result = f"Tool error: {e}"
        else:
            result = f"Unknown tool: {p['tool_name']}"
        results_note.append(f"[Tool '{p['tool_name']}' approved. Result: {str(result)[:800]}]")

    if not results_note:
        return "No pending approvals.", None

    if model_config is None and mc_data:
        model_config = ModelConfig(provider=mc_data.get("provider", "anthropic"), model=mc_data.get("model", ""), api_key=mc_data.get("api_key", ""), base_url=mc_data.get("base_url", ""))
    if model_config is None:
        model_config = ModelConfig()
    sp = _build_system_prompt(system_prompt)

    agent = build_agent()
    config = {"configurable": {"thread_id": thread_id, "model_config": model_config, "system_prompt": sp, "skip_approval": True}}
    state = await agent.ainvoke(AgentState(messages=[{"role": "user", "content": "\n".join(results_note)}], next="agent", tool_calls=[], tool_outputs=[], pending_approvals=[]), config)

    # Save thread context
    ctx_msgs = []
    for m in state["messages"]:
        d = m if isinstance(m, dict) else {}
        if d.get("role") in ("assistant",):
            ctx_msgs.append({"role": d["role"], "content": str(d.get("content", ""))[:500]})
    if ctx_msgs:
        add_messages(thread_id, ctx_msgs)

    p2 = state.get("pending_approvals", [])
    if p2:
        return "", p2
    for m in reversed(state["messages"]):
        d = m if isinstance(m, dict) else {}
        if d.get("role") == "assistant":
            return d.get("content", ""), None
    return "No response.", None
