"""Agent tools for reading/writing cross-session memory."""

from langchain_core.tools import tool

from core.memory import save_memory, get_relevant_memories


@tool
def save_observation(
    mem_type: str,
    content: str,
    tags: str = "",
    situation: str = "",
    priority: int = 3,
) -> str:
    """Save an observation or lesson you learned to cross-session memory.

    Use this when you discover something worth remembering:
    - The user corrects you → type='feedback'
    - You discover the user's preferences or role → type='user'
    - Decisions about the project → type='project'
    - Where to find external information → type='reference'

    Args:
        mem_type: One of 'user', 'feedback', 'project', 'reference'
        content: What you learned (concise, specific)
        tags: Comma-separated keywords for retrieval (e.g. "coding-style,preferences")
        situation: What prompted this (optional)
        priority: Importance 1-5 (3=normal, 5=critical)
    """
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    entry = save_memory(mem_type, content, tag_list, situation, priority)
    return f"Saved memory [{entry.id}] ({mem_type})"


@tool
def recall_memories(query: str, max_results: int = 5) -> str:
    """Search previously saved memories relevant to a query.

    Use this to proactively look up past learnings, user preferences,
    or project decisions when you want to check before acting.

    Args:
        query: What to search for
        max_results: Max entries to return (1-10)
    """
    results = get_relevant_memories(query, max_results=min(max_results, 10))
    if not results:
        return "No relevant memories found."
    lines = [f"Found {len(results)} relevant memories:"]
    for m in results:
        mtype = m.get("type", "?")
        content = m.get("content", "")
        tags = ", ".join(m.get("tags", []))
        score = m.get("_score", 0)
        lines.append(f"  [{mtype}] (score={score}) {content}")
        if tags:
            lines.append(f"       tags: {tags}")
    return "\n".join(lines)
