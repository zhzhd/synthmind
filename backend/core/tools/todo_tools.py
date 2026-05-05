"""Todo list tools — DeepAgents-style write_todos / read_todos.

The agent uses these tools for planning: when the user gives a multi-step
request, the agent writes a plan as todos, then works through them.
"""

import json
from langchain_core.tools import tool

from services.todos import list_todos, create_todo, update_todo, delete_todo


@tool
def write_todos(todos: str) -> str:
    """Write a todo list / task plan.

    Use this to break down a complex request into actionable steps.
    Each step should be a clear, single action.

    THIS IS THE MOST IMPORTANT TOOL. You MUST use it at the start
    of any multi-step task.  Write a plan first, then work through
    each item one at a time.

    * Only keep ONE task as 'in_progress' at a time.
    * Mark tasks as 'completed' immediately when done.
    * Add new tasks if you discover more work is needed.
    * Use the `read_todos` tool to review your plan at any time.

    Args:
        todos: A JSON array of task objects, each with "title" and
               optional "description".  Example:

               [{"title": "Research the topic", "description": "Use web search..."},
                {"title": "Analyze findings", "description": "..."},
                {"title": "Write summary", "description": "..."}]

    Returns:
        Confirmation with the number of tasks created.
    """
    try:
        items = json.loads(todos) if isinstance(todos, str) else todos
    except json.JSONDecodeError:
        return "❌ Invalid JSON format. Use: [{\"title\": \"...\", \"description\": \"...\"}]"

    # Clear existing tasks and write the new plan
    for t in list_todos():
        delete_todo(t["id"])
    count = 0
    for item in items:
        create_todo(
            title=item.get("title", "Untitled"),
            description=item.get("description", ""),
            status="pending",
        )
        count += 1

    # Mark the first task as in_progress
    todos_list = list_todos()
    if todos_list:
        update_todo(todos_list[0]["id"], status="in_progress")

    return f"✅ Plan created with {count} tasks. Starting with the first one."


@tool
def read_todos() -> str:
    """Read the current todo list / task plan.

    Use this to review your plan, check progress, or decide what to
    do next.  Returns a formatted task list with status.

    Returns:
        Formatted task list or "No tasks" message.
    """
    todos = list_todos()
    if not todos:
        return "📋 No tasks. Use `write_todos` to create a plan."

    lines = ["📋 Plan:\n"]
    for t in todos:
        icon = {"pending": "⏳", "in_progress": "🔄", "completed": "✅", "blocked": "🚫"}.get(t.get("status", ""), "📌")
        lines.append(f"  {icon} **{t['title']}** — {t['status']}")
        if t.get("description"):
            lines.append(f"     _{t['description']}_")
    return "\n".join(lines)


@tool
def update_task(task_id: str, status: str) -> str:
    """Update the status of a task.

    Status options: 'pending', 'in_progress', 'completed', 'blocked'.

    IMPORTANT: Only ONE task should be 'in_progress' at a time.
    When you start a new task, set the previous one to 'completed'
    and the new one to 'in_progress'.

    Args:
        task_id: The task ID (use read_todos to find it).
        status: New status.

    Returns:
        Confirmation message.
    """
    valid = ("pending", "in_progress", "completed", "blocked")
    if status not in valid:
        return f"❌ Invalid status '{status}'. Use: {', '.join(valid)}"

    result = update_todo(task_id, status=status)
    if result:
        return f"✅ Task [{task_id[:8]}] → {status}"
    return f"❌ Task [{task_id[:8]}] not found"


@tool
def delete_task(task_id: str) -> str:
    """Delete a task from the plan.

    Args:
        task_id: The task ID to delete.

    Returns:
        Confirmation message.
    """
    if delete_todo(task_id):
        return f"🗑️ Task [{task_id[:8]}] deleted."
    return f"❌ Task [{task_id[:8]}] not found."


# ── Few-shot examples for agent prompt ─────────────────────────────

TODO_SYSTEM_PROMPT = """

## Todo List / Task Planning

You have access to a todo list system.  ALWAYS use it for multi-step
or complex tasks.  The tools are:

- `write_todos` — Write a complete plan. Replaces old tasks.
- `read_todos` — Read the current plan.
- `update_task` — Mark a task as completed / in_progress / blocked.
- `delete_task` — Remove a task.

### How to use (examples)

**Good — multi-step request:** Write a todo list first:
  User: "Research AI trends and write a summary"
  You: write_todos([{"title": "Research latest AI trends", "description": "Search web for 2025 AI trends"}, {"title": "Analyze and summarize findings"}, {"title": "Write final response"}])
  Then work through each task, updating status as you go.

**Good — new information requires replanning:**
  When you discover a task needs sub-steps, write a new plan:
  write_todos([...revised plan...])

**Bad — single trivial task:** Do NOT use write_todos for simple
questions like "What's the weather?" or "Tell me a joke".  Just answer.

### Rules
1. Only ONE task is 'in_progress' at a time.
2. Mark tasks 'completed' as soon as you finish them.
3. Update the plan when priorities change.
4. Use read_todos to review your progress.
"""
