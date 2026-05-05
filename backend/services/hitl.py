"""Human-in-the-loop — pending approval queue."""

from __future__ import annotations

import time
from typing import Any

_pending: dict[str, dict] = {}


def check_tool_needs_approval(tool_name: str, tool_args: dict) -> bool:
    from core.tools import SENSITIVE_TOOLS
    return tool_name in SENSITIVE_TOOLS


def create_pending(thread_id: str, tool_name: str, tool_args: dict, tool_call_id: str, explanation: str = "", model_config: dict | None = None) -> str:
    pid = f"pa_{int(time.time() * 1000)}_{tool_call_id[:8]}"
    _pending[pid] = {"id": pid, "thread_id": thread_id, "tool_name": tool_name, "tool_args": tool_args, "tool_call_id": tool_call_id, "explanation": explanation, "model_config": model_config or {}, "status": "pending", "edited_args": None, "created_at": time.time()}
    return pid


def get_pending(pending_id: str) -> dict | None:
    return _pending.get(pending_id)


def resolve_pending(pending_id: str, decision: str, edited_args: dict | None = None) -> dict | None:
    r = _pending.get(pending_id)
    if r is None or r["status"] != "pending":
        return r
    r["status"] = decision
    if decision == "edit" and edited_args:
        r["edited_args"] = edited_args
    return r


def cleanup_thread(thread_id: str) -> None:
    for k in [k for k, v in _pending.items() if v["thread_id"] == thread_id]:
        _pending.pop(k, None)
