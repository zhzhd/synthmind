"""Tool that allows the main agent to delegate tasks to sub-agents.

Uses ``run_subagent`` which builds an isolated LangGraph instance with its
own system prompt, tool set, and model configuration.
"""

from langchain_core.tools import tool


@tool
def delegate(agent_name: str, task: str, context: str = "") -> str:
    """Delegate a task to a specialized sub-agent.

    Use this when a task requires a different focus, tool set, or model.
    The sub-agent runs independently with its own context — it does NOT
    share your conversation history.

    Available agents: code-reviewer, web-researcher, data-cruncher

    Args:
        agent_name: Which sub-agent to invoke (e.g. 'code-reviewer')
        task: Clear, specific description of what the sub-agent should do
        context: Optional relevant context from the current conversation
    """
    from services.subagents import run_subagent, list_agents  # lazy import

    available = {a["name"] for a in list_agents()}
    if agent_name not in available:
        names = ", ".join(sorted(available))
        return f"Error: Agent '{agent_name}' not found. Available agents: {names}"

    try:
        result, run_id = run_subagent(agent_name, task, context)
        if run_id:
            return f"[Sub-agent '{agent_name}' completed (run: {run_id})]\n{result}"
        return result
    except Exception as e:
        return f"Sub-agent error ({agent_name}): {e}"
