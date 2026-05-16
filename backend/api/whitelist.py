"""Whitelist CRUD endpoints — GET/POST/DELETE /api/whitelist."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.whitelist import list_whitelist, add_to_whitelist, remove_from_whitelist

router = APIRouter()


class WhitelistAddRequest(BaseModel):
    tool_name: str


@router.get("/api/whitelist")
async def get_whitelist():
    """Return all whitelisted tool names."""
    return {"whitelist": list_whitelist()}


@router.post("/api/whitelist")
async def add_whitelist(req: WhitelistAddRequest):
    """Add a tool name to the whitelist."""
    if not req.tool_name.strip():
        raise HTTPException(400, "tool_name is required")
    add_to_whitelist(req.tool_name.strip())
    return {"ok": True, "tool_name": req.tool_name.strip()}


@router.delete("/api/whitelist/{tool_name}")
async def delete_whitelist(tool_name: str):
    """Remove a tool name from the whitelist."""
    remove_from_whitelist(tool_name)
    return {"ok": True}
