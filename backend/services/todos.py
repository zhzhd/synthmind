"""Todo list persistence — stores tasks in .config/todos.json."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

_TODOS_FILE = Path(__file__).resolve().parent.parent / ".config" / "todos.json"
_TODOS_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load() -> list[dict]:
    if _TODOS_FILE.exists():
        try:
            return json.loads(_TODOS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save(data: list[dict]) -> None:
    _TODOS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def list_todos(status: str | None = None) -> list[dict]:
    todos = _load()
    if status:
        todos = [t for t in todos if t.get("status") == status]
    return sorted(todos, key=lambda t: t.get("created_at", 0), reverse=True)


def create_todo(title: str, description: str = "", status: str = "pending") -> dict:
    todos = _load()
    item = {
        "id": uuid.uuid4().hex[:12],
        "title": title,
        "description": description,
        "status": status,
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    todos.append(item)
    _save(todos)
    return item


def update_todo(todo_id: str, **kwargs) -> dict | None:
    todos = _load()
    for t in todos:
        if t["id"] == todo_id:
            for k in ("title", "description", "status"):
                if k in kwargs:
                    t[k] = kwargs[k]
            t["updated_at"] = time.time()
            _save(todos)
            return t
    return None


def delete_todo(todo_id: str) -> bool:
    todos = _load()
    new = [t for t in todos if t["id"] != todo_id]
    if len(new) == len(todos):
        return False
    _save(new)
    return True


def complete_todo(todo_id: str) -> dict | None:
    return update_todo(todo_id, status="completed")
