"""Sub-agent manager — load, build, and execute isolated subagent LangGraph instances.

Each subagent is defined by a Markdown file (``AGENT.md``) with YAML frontmatter:
  - tools: list of allowed tool names
  - model_provider, model, temperature, max_tokens: LLM config
  - The body becomes the system prompt.

Subagents run as independent 2-node LangGraph graphs:
    agent → tools → agent → tools → ... → END
"""

from __future__ import annotations

import json
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, StateGraph

from core.llm import get_chat_model
from core.state import AgentState, ModelConfig

# ── Paths ─────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
AGENTS_DIR = BASE_DIR / ".agents"
RUNS_DIR = BASE_DIR / ".config" / "subagent_runs"
AGENTS_DIR.mkdir(parents=True, exist_ok=True)
RUNS_DIR.mkdir(parents=True, exist_ok=True)

_MAX_DEPTH = 3

# ── Frontmatter parsing (same pattern as services/skills.py) ──────────

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)", re.DOTALL)


def _parse_md(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter + body from a Markdown file.

    Supports both:
      tools: read_file, grep        (comma-separated)
      tools: ['read_file', 'grep']  (Python repr list)
      tools:                        (YAML list)
        - read_file
        - grep
    """
    m = FRONTMATTER_RE.match(content)
    if not m:
        return {}, content
    meta = {}
    current_list_key = None
    for line in m.group(1).strip().splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        # YAML list item under a key
        if stripped.startswith("- ") and current_list_key:
            value = stripped[2:].strip().strip('"').strip("'")
            if isinstance(meta.get(current_list_key), list):
                meta[current_list_key].append(value)
            else:
                meta[current_list_key] = [value]
            continue
        # Key: value
        if ":" in line:
            k, _, v = line.partition(":")
            key = k.strip()
            val = v.strip().strip('"').strip("'")
            # Handle Python repr list: "['a', 'b']"
            if val.startswith("[") and val.endswith("]"):
                import ast
                try:
                    parsed = ast.literal_eval(val)
                    if isinstance(parsed, list):
                        meta[key] = parsed
                    else:
                        meta[key] = val
                except Exception:
                    meta[key] = val
            elif val == "" or val.startswith("#"):
                # Could be a list start
                meta[key] = []
                current_list_key = key
            else:
                meta[key] = val
                current_list_key = None
        else:
            current_list_key = None
    return meta, m.group(2).strip()


def _make_md(meta: dict, instructions: str) -> str:
    """Build AGENT.md from metadata dict and body."""
    lines = ["---"]
    for k, v in meta.items():
        if isinstance(v, list):
            lines.append(f"{k}:")
            for item in v:
                lines.append(f"  - {item}")
        elif isinstance(v, bool):
            lines.append(f"{k}: {'true' if v else 'false'}")
        else:
            lines.append(f"{k}: {v}")
    lines.append("---")
    lines.append("")
    lines.append(instructions)
    return "\n".join(lines)


# ── Agent definition CRUD ─────────────────────────────────────────────

def list_agents() -> list[dict]:
    """Scan .agents/*/AGENT.md and return metadata."""
    agents = []
    for entry in sorted(AGENTS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        am = entry / "AGENT.md"
        if not am.exists():
            continue
        meta, _ = _parse_md(am.read_text())
        name = meta.get("name", entry.name)
        tools = meta.get("tools", [])
        if isinstance(tools, str):
            tools = [t.strip() for t in tools.split(",") if t.strip()]
        agents.append({
            "name": name,
            "description": meta.get("description", ""),
            "version": meta.get("version", "1.0.0"),
            "author": meta.get("author", "unknown"),
            "tools": tools,
            "model_provider": meta.get("model_provider", ""),
            "model": meta.get("model", ""),
            "temperature": float(meta.get("temperature", 0.7)),
            "max_tokens": int(meta.get("max_tokens", 4096)),
            "path": str(entry),
        })
    return agents


def get_agent(name: str) -> dict | None:
    """Load full agent definition including system_prompt."""
    ad = AGENTS_DIR / name
    am = ad / "AGENT.md"
    if not am.exists():
        return None
    meta, instructions = _parse_md(am.read_text())
    tools = meta.get("tools", [])
    if isinstance(tools, str):
        tools = [t.strip() for t in tools.split(",") if t.strip()]
    return {
        "name": meta.get("name", name),
        "description": meta.get("description", ""),
        "version": meta.get("version", "1.0.0"),
        "author": meta.get("author", "unknown"),
        "tools": tools,
        "model_provider": meta.get("model_provider", ""),
        "model": meta.get("model", ""),
        "temperature": float(meta.get("temperature", 0.7)),
        "max_tokens": int(meta.get("max_tokens", 4096)),
        "system_prompt": instructions,
    }


def install_agent(
    name: str,
    description: str,
    tools: list[str],
    system_prompt: str,
    author: str = "user",
    version: str = "1.0.0",
    model_provider: str = "anthropic",
    model: str = "claude-sonnet-4-20250514",
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> dict:
    """Write a new agent definition."""
    d = AGENTS_DIR / name
    d.mkdir(parents=True, exist_ok=True)
    meta = {
        "name": name,
        "description": description,
        "version": version,
        "author": author,
        "tools": tools,
        "model_provider": model_provider,
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    (d / "AGENT.md").write_text(_make_md(meta, system_prompt))
    return {
        "name": name,
        "description": description,
        "tools": tools,
        "model_provider": model_provider,
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }


def remove_agent(name: str) -> bool:
    d = AGENTS_DIR / name
    if not d.exists():
        return False
    shutil.rmtree(d)
    return True


# ── Tool filtering ────────────────────────────────────────────────────

def _filter_tools(allowed_names: list[str]) -> list:
    """Return only tools whose names are in the allowed list."""
    from core.tools import get_tools  # lazy import to avoid circular deps
    all_tools = {t.name: t for t in get_tools()}
    return [all_tools[name] for name in allowed_names if name in all_tools]


# ── Subagent graph ────────────────────────────────────────────────────

def _make_subagent_nodes(system_prompt: str, model_config: ModelConfig, allowed_tools: list):
    """Factory: returns (call_model_fn, execute_tools_fn) with config captured in closure."""

    def call_model(state: AgentState, config=None) -> dict:
        llm_kw = dict(
            provider=model_config.provider,
            model=model_config.model,
            temperature=model_config.temperature,
            max_tokens=model_config.max_tokens,
        )
        if model_config.api_key:
            llm_kw["api_key"] = model_config.api_key
        if model_config.base_url:
            llm_kw["base_url"] = model_config.base_url
        llm = get_chat_model(**llm_kw).bind_tools(allowed_tools)

        msgs = [SystemMessage(content=system_prompt)]

        # Collect executed tool_call_ids
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
                    ai_kw["tool_calls"] = [
                        {"name": t["name"], "args": t["args"], "id": t["id"]} for t in tc
                    ]
                extra: dict = {}
                for k in ("reasoning_content",):
                    if k in m:
                        extra[k] = m[k]
                if extra:
                    ai_kw["additional_kwargs"] = extra
                msgs.append(AIMessage(**ai_kw))
            elif m["role"] == "tool":
                msgs.append(ToolMessage(content=m["content"], tool_call_id=m["tool_call_id"]))

        response = llm.invoke(msgs)
        tool_calls = []
        if hasattr(response, "tool_calls") and response.tool_calls:
            tool_calls = [
                {"name": tc["name"], "args": tc["args"], "id": tc["id"]}
                for tc in response.tool_calls
            ]

        asst_msg: dict = {"role": "assistant", "content": response.content}
        if tool_calls:
            asst_msg["tool_calls"] = [
                {"type": "tool_call", "name": tc["name"], "args": tc["args"], "id": tc["id"]}
                for tc in tool_calls
            ]
        extras = getattr(response, "additional_kwargs", {}) or {}
        for k in ("reasoning_content",):
            if k in extras:
                asst_msg[k] = extras[k]

        return {"messages": [asst_msg], "tool_calls": tool_calls, "next": "tools" if tool_calls else END}

    def execute_tools(state: AgentState, config=None) -> dict:
        from core.tools import get_tools  # lazy import
        tmap = {t.name: t for t in get_tools()}
        outputs = []
        for tc in state["tool_calls"]:
            fn = tmap.get(tc["name"])
            if fn:
                try:
                    result = fn.invoke(tc["args"])
                except Exception as e:
                    result = f"Tool error: {e}"
            else:
                result = f"Unknown tool: {tc['name']}"
            outputs.append({"role": "tool", "content": str(result), "tool_call_id": tc["id"]})
        return {"messages": outputs, "tool_outputs": outputs, "next": "agent"}

    return call_model, execute_tools


def _build_subgraph(system_prompt: str, model_config: ModelConfig, allowed_tools: list) -> StateGraph:
    """Build a 2-node subagent graph (no HITL) with config captured via closure."""
    call_model, execute_tools = _make_subagent_nodes(system_prompt, model_config, allowed_tools)

    wf = StateGraph(AgentState)
    wf.add_node("agent", call_model)
    wf.add_node("tools", execute_tools)
    wf.set_entry_point("agent")
    wf.add_conditional_edges("agent", lambda s: s["next"])
    wf.add_edge("tools", "agent")
    return wf.compile()


# ── Run subagent ──────────────────────────────────────────────────────

def run_subagent(
    agent_name: str,
    task: str,
    context: str = "",
    depth: int = 0,
) -> tuple[str, str]:
    """Build and execute an isolated subagent synchronously.

    Returns (result_text, run_id).
    """
    if depth >= _MAX_DEPTH:
        return f"Max delegation depth ({_MAX_DEPTH}) reached.", ""

    agent_def = get_agent(agent_name)
    if agent_def is None:
        return f"Agent '{agent_name}' not found.", ""

    # Build model config
    mc = ModelConfig(
        provider=agent_def["model_provider"] or "anthropic",
        model=agent_def["model"] or "claude-sonnet-4-20250514",
        temperature=agent_def["temperature"],
        max_tokens=agent_def["max_tokens"],
    )

    # Filter tools
    allowed_tools = _filter_tools(agent_def["tools"])

    # Build system prompt — append context if provided
    system_prompt = agent_def["system_prompt"]
    if context:
        system_prompt += f"\n\n## Context from parent conversation\n{context}"

    # Build task message — include depth info
    depth_label = f" (depth: {depth})" if depth else ""
    task_msg = f"## Task{depth_label}\n{task}"

    # Build and run subgraph (config captured in closure, no need to pass at invoke)
    subgraph = _build_subgraph(system_prompt, mc, allowed_tools)
    try:
        state = subgraph.invoke(
            AgentState(
                messages=[{"role": "user", "content": task_msg}],
                next="agent",
                tool_calls=[],
                tool_outputs=[],
                pending_approvals=[],
            ),
        )
    except Exception as e:
        return f"Sub-agent error: {e}", ""

    # Extract final assistant response
    result = "No response from sub-agent."
    for m in reversed(state["messages"]):
        d = m if isinstance(m, dict) else {}
        if d.get("role") == "assistant" and d.get("content", "").strip():
            result = d["content"]
            break

    # Persist run
    run_id = f"sa_{uuid.uuid4().hex[:10]}"
    run_record = {
        "run_id": run_id,
        "agent_name": agent_name,
        "task": task,
        "depth": depth,
        "result": result[:2000],
        "created_at": time.time(),
    }
    (RUNS_DIR / f"{run_id}.json").write_text(
        json.dumps(run_record, indent=2, ensure_ascii=False)
    )

    return result, run_id
