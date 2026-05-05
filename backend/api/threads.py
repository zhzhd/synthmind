"""Thread / conversation history endpoints."""

from fastapi import APIRouter, HTTPException

from services.threads import get_history

router = APIRouter()


@router.get("/api/threads/{thread_id}")
async def get_thread(thread_id: str):
    """Return the message history for a thread."""
    history = get_history(thread_id)
    return {"thread_id": thread_id, "messages": history}
