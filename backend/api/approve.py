"""Approval endpoints — POST /api/approve, POST /api/approve-all."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from core.agent import resume_with_approval, resume_with_multiple_approvals
from core.state import ApprovalRequest, ModelConfig
from services.hitl import get_pending, resolve_pending
from services.whitelist import add_to_whitelist

router = APIRouter()


@router.post("/api/approve")
async def approve(req: ApprovalRequest):
    pending = get_pending(req.pending_id)
    if not pending:
        raise HTTPException(404, "Approval not found")
    resolve_pending(req.pending_id, req.decision, req.edited_args)

    # Whitelist the tool if requested
    if req.whitelist and req.decision == "approve":
        add_to_whitelist(pending["tool_name"])

    mc_data = pending.get("model_config", {})
    mc = ModelConfig(provider=mc_data.get("provider", "anthropic"), model=mc_data.get("model", ""), api_key=mc_data.get("api_key", ""), base_url=mc_data.get("base_url", ""))

    content, pending2 = await resume_with_approval(pending_id=req.pending_id, thread_id=pending["thread_id"], model_config=mc)
    if pending2:
        return {"type": "approval", "thread_id": pending["thread_id"], "pending": pending2}
    return {"type": "response", "message": content, "thread_id": pending["thread_id"]}


@router.post("/api/approve-all")
async def approve_all(body: dict):
    pending_ids = body.get("pending_ids", [])
    thread_id = body.get("thread_id", "")
    if not pending_ids:
        from fastapi.responses import JSONResponse
        return JSONResponse(400, content={"detail": "No pending_ids"})
    content, pending2 = await resume_with_multiple_approvals(pending_ids=pending_ids, thread_id=thread_id)
    if pending2:
        return {"type": "approval", "thread_id": thread_id, "pending": pending2}
    return {"type": "response", "message": content, "thread_id": thread_id}
