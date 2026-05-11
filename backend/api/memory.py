"""Memory API — list, save, and delete cross-session memories from the frontend."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.memory import save_memory, delete_memory, list_memories, MEMORY_TYPES

router = APIRouter()


class SaveMemoryRequest(BaseModel):
    type: str
    content: str
    tags: str = ""
    situation: str = ""
    priority: int = 3


@router.get("/api/memory")
async def get_memories(type: str | None = None):
    """List all memory entries, optionally filtered by type."""
    if type and type not in MEMORY_TYPES:
        raise HTTPException(400, f"Invalid type: {type}. Use {MEMORY_TYPES}")
    return {"memories": list_memories(type)}


@router.post("/api/memory")
async def add_memory(req: SaveMemoryRequest):
    """Manually save a memory entry."""
    if req.type not in MEMORY_TYPES:
        raise HTTPException(400, f"Invalid type: {req.type}. Use {MEMORY_TYPES}")
    tag_list = [t.strip() for t in req.tags.split(",") if t.strip()]
    entry = save_memory(req.type, req.content, tag_list, req.situation, req.priority)
    return {"id": entry.id, "type": entry.type, "content": entry.content}


@router.delete("/api/memory/{memory_id}")
async def remove_memory(memory_id: str):
    """Delete a memory entry."""
    if delete_memory(memory_id):
        return {"status": "deleted"}
    raise HTTPException(404, "Memory not found")
