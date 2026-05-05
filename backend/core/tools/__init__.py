"""Tool definitions.

Add new tools by creating a file here, decorating a function with
``@tool``, and adding it to ``TOOLS`` below.
"""

from core.tools.calculator import calculator
from core.tools.time_tool import get_current_time
from core.tools.file_ops import read_file
from core.tools.web_search import web_search
from core.tools.todo_tools import write_todos, read_todos, update_task, delete_task, TODO_SYSTEM_PROMPT

# ── All tools the agent can use ────────────────────────────────────
TOOLS = [calculator, get_current_time, read_file, web_search, write_todos, read_todos, update_task, delete_task]


def get_tools():
    return TOOLS


def get_todo_prompt() -> str:
    """Return the todo-list system prompt for agent planning."""
    return TODO_SYSTEM_PROMPT


# ── Sensitive tools (require human approval) ──────────────────────
SENSITIVE_TOOLS: dict[str, dict] = {
    "web_search": {},
    "read_file": {},
}
