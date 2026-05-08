"""Sandbox execution history endpoint."""

import json
import time
import uuid
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()

_HISTORY_FILE = Path(__file__).resolve().parent.parent / ".config" / "sandbox.json"
_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)


@router.get("/api/sandbox")
async def get_sandbox_history():
    if _HISTORY_FILE.exists():
        try:
            entries = json.loads(_HISTORY_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            entries = []
    else:
        entries = []
    return {"entries": entries}


def record_execution(type_: str, code: str, output: str) -> None:
    """Record a sandbox execution (called by tools)."""
    entries = []
    if _HISTORY_FILE.exists():
        try:
            entries = json.loads(_HISTORY_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            entries = []
    entries.insert(0, {
        "id": uuid.uuid4().hex[:8],
        "type": type_,
        "code": code[:200],
        "output": output[:500],
        "timestamp": time.time(),
    })
    # Keep last 50 entries
    entries = entries[:50]
    _HISTORY_FILE.write_text(json.dumps(entries, indent=2, ensure_ascii=False))
