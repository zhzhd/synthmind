"""Tool definitions.

Add new tools by creating a file here, decorating a function with
``@tool``, and adding it to ``TOOLS`` below.
"""

from core.tools.time_tool import get_current_time
from core.tools.file_ops import ls, read_file, write_file, edit_file, glob, grep
from core.tools.web_search import web_search
from core.tools.todo_tools import write_todos, read_todos, update_task, delete_task, TODO_SYSTEM_PROMPT
from core.tools.sandbox_tools import execute_command, python_repl
from core.tools.memory_tools import save_observation, recall_memories
from core.tools.delegate_tool import delegate

# ── All tools the agent can use ────────────────────────────────────
TOOLS = [get_current_time, ls, read_file, write_file, edit_file, grep, glob, web_search, write_todos, read_todos, update_task, delete_task, execute_command, python_repl, save_observation, recall_memories, delegate]


def get_tools():
    return TOOLS


def get_todo_prompt() -> str:
    """Return the todo-list system prompt for agent planning."""
    return TODO_SYSTEM_PROMPT


# ── Sensitive tools (require human approval) ──────────────────────
SENSITIVE_TOOLS: dict[str, dict] = {
    "web_search": {},
    "read_file": {},
    "write_file": {},
    "edit_file": {},
}
