"""Time Travel API — browse checkpoints and branch from historical states.

Requires the checkpointer (MemorySaver) to be active on the compiled agent.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.agent import get_agent
from core.state import AgentState

router = APIRouter()


def _format_msg_preview(msg: dict) -> str:
    """Return a short preview string for a message dict."""
    if not isinstance(msg, dict):
        return ""
    role = msg.get("role", "")
    content = msg.get("content", "")
    if role == "user":
        return f"User: {str(content)[:100]}"
    if role == "assistant":
        tc = msg.get("tool_calls", [])
        if tc:
            names = ", ".join(t.get("name", "?") for t in tc)
            return f"Assistant → [{names}]"
        return f"Assistant: {str(content)[:100]}"
    if role == "tool":
        return f"Tool result: {str(content)[:80]}"
    return str(content)[:80]


@router.get("/api/threads/{thread_id}/checkpoints")
async def list_checkpoints(thread_id: str):
    """List all checkpoints for a thread, oldest first."""
    try:
        agent = get_agent()
    except Exception as e:
        raise HTTPException(500, f"Failed to get agent: {e}")

    config = {"configurable": {"thread_id": thread_id}}
    try:
        history = list(agent.get_state_history(config))
    except Exception as e:
        raise HTTPException(404, f"Thread not found or no checkpoints: {e}")

    # history is newest-first; reverse to show oldest first
    checkpoints = []
    for h in reversed(history):
        cp_id = h.config.get("configurable", {}).get("checkpoint_id", "")
        messages = h.values.get("messages", [])
        last_msg = messages[-1] if messages else {}

        next_nodes = list(h.next) if h.next else []

        checkpoints.append({
            "checkpoint_id": cp_id,
            "step": len(checkpoints),
            "node": h.metadata.get("source", ""),
            "next": next_nodes,
            "total_messages": len(messages),
            "msg_preview": _format_msg_preview(last_msg) if last_msg else "",
        })

    return {"checkpoints": checkpoints}


class BranchRequest(BaseModel):
    checkpoint_id: str
    message: str = ""


@router.post("/api/threads/{thread_id}/branch")
async def branch_from_checkpoint(thread_id: str, body: BranchRequest):
    """Branch from a historical checkpoint into a new thread.

    Creates a new thread with the state captured at the given checkpoint,
    optionally runs the agent with a new message, and returns the result.
    """
    agent = get_agent()

    # Get state at the specified checkpoint
    target_config = {
        "configurable": {
            "thread_id": thread_id,
            "checkpoint_id": body.checkpoint_id,
        }
    }
    try:
        target_state = agent.get_state(target_config)
    except Exception as e:
        raise HTTPException(404, f"Checkpoint not found: {e}")

    if target_state is None:
        raise HTTPException(404, "Checkpoint not found")
    if not target_state.values:
        raise HTTPException(400, "Checkpoint has no state")

    messages = list(target_state.values.get("messages", []))
    if not messages:
        raise HTTPException(400, "Checkpoint has no messages")

    # Create new thread with checkpoint state pre-populated in the checkpointer
    new_thread_id = uuid.uuid4().hex[:12]

    if body.message:
        # Invoke the agent on the new thread with checkpoint messages + new message
        cfg = {"configurable": {"thread_id": new_thread_id}}
        state = await agent.ainvoke(
            AgentState(
                messages=messages + [{"role": "user", "content": body.message}],
                next="agent", tool_calls=[], tool_outputs=[], pending_approvals=[],
            ),
            cfg,
        )
        pending = state.get("pending_approvals", [])
        if pending:
            return {
                "type": "approval",
                "thread_id": new_thread_id,
                "pending": pending,
                "branched_from": thread_id,
            }
        all_msgs = state.get("messages", [])
        content = ""
        reasoning = None
        for m in reversed(all_msgs):
            d = m if isinstance(m, dict) else {}
            if d.get("role") == "assistant":
                content = d.get("content", "")
                reasoning = d.get("reasoning_content")
                break
        resp = {
            "type": "response",
            "message": content,
            "thread_id": new_thread_id,
            "branched_from": thread_id,
        }
        if reasoning:
            resp["reasoning_content"] = reasoning
        return resp

    return {"thread_id": new_thread_id, "branched_from": thread_id, "message_count": len(messages)}
