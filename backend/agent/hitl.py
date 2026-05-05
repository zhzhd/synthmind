"""Human-in-the-loop — pause agent execution for user approval.

When the agent attempts to call a sensitive tool, execution is paused
and the tool details are returned to the frontend for the user to
approve, reject, or edit. Once the user responds, the agent resumes.
"""

from __future__ import annotations

import time
from typing import Any

from agent.tools import SENSITIVE_TOOLS

# ── In-memory pending approvals ───────────────────────────────────
# Keyed by a unique pending_id.
_pending: dict[str, dict] = {}


def check_tool_needs_approval(tool_name: str, tool_args: dict) -> bool:
    """Return True if this tool call requires human approval."""
    config = SENSITIVE_TOOLS.get(tool_name)
    if config is None:
        return False
    # if config is a dict with conditions, check them here (future)
    return True


def create_pending(
    thread_id: str,
    tool_name: str,
    tool_args: dict,
    tool_call_id: str,
    explanation: str = "",
    model_config: dict | None = None,
) -> str:
    """Register a pending approval and return its ID."""
    pending_id = f"pa_{int(time.time() * 1000)}_{tool_call_id[:8]}"
    _pending[pending_id] = {
        "id": pending_id,
        "thread_id": thread_id,
        "tool_name": tool_name,
        "tool_args": tool_args,
        "tool_call_id": tool_call_id,
        "explanation": explanation,
        "model_config": model_config or {},
        "status": "pending",  # pending | approved | rejected | edited
        "edited_args": None,
        "created_at": time.time(),
    }
    return pending_id


def get_pending(pending_id: str) -> dict | None:
    """Look up a pending approval."""
    return _pending.get(pending_id)


def resolve_pending(
    pending_id: str,
    decision: str,
    edited_args: dict | None = None,
) -> dict | None:
    """Resolve a pending approval with the user's decision.

    Args:
        pending_id: The approval ID.
        decision: ``approve``, ``reject``, or ``edit``.
        edited_args: New tool args when decision is ``edit``.

    Returns:
        The updated pending record, or None if not found.
    """
    record = _pending.get(pending_id)
    if record is None:
        return None
    if record["status"] != "pending":
        return record  # already resolved

    record["status"] = decision
    if decision == "edit" and edited_args:
        record["edited_args"] = edited_args
    return record


def cleanup_thread(thread_id: str) -> None:
    """Remove all pending approvals for a thread."""
    to_delete = [k for k, v in _pending.items() if v["thread_id"] == thread_id]
    for k in to_delete:
        _pending.pop(k, None)
