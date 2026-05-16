"""Traces API — GET /api/traces to list recorded traces."""

from __future__ import annotations

from fastapi import APIRouter, Query

from services.tracing import list_traces, clear_traces

router = APIRouter()


@router.get("/api/traces")
async def get_traces(thread_id: str | None = Query(default=None)):
    """Return all traces, optionally filtered by thread_id."""
    return {"traces": list_traces(thread_id)}


@router.delete("/api/traces")
async def delete_traces():
    """Clear all traces."""
    clear_traces()
    return {"ok": True}
