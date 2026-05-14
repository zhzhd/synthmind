"""Conversation thread memory — stores message history for context.

Each thread (identified by ``thread_id``) maintains an ordered list of
messages.  Old messages are automatically summarized when the history
exceeds a token threshold.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

_THREADS_DIR = Path(__file__).resolve().parent.parent / ".config" / "threads"
_THREADS_DIR.mkdir(parents=True, exist_ok=True)

# Rough token budget: 1 message ≈ 50 tokens average
_MAX_MESSAGES = 60
_SUMMARIZE_AFTER = 40


def _thread_path(thread_id: str) -> Path:
    return _THREADS_DIR / f"{thread_id}.json"


def get_history(thread_id: str) -> list[dict]:
    """Return all messages for a thread (oldest first)."""
    path = _thread_path(thread_id)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
        return data.get("messages", [])
    except (json.JSONDecodeError, OSError):
        return []


def add_messages(thread_id: str, messages: list[dict]) -> None:
    """Append messages to a thread and persist."""
    history = get_history(thread_id)
    history.extend(messages)
    _save(thread_id, history)
    _maybe_compress(thread_id, history)


def _save(thread_id: str, messages: list[dict]) -> None:
    path = _thread_path(thread_id)
    # Preserve existing thread metadata (workdir, etc.) when saving messages
    existing = {}
    if path.exists():
        try:
            existing = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            existing = {}
    existing.pop("messages", None)
    existing.pop("updated_at", None)
    data = {"thread_id": thread_id, "messages": messages, "updated_at": time.time()}
    # Carry forward any extra fields (e.g. workdir)
    data.update(existing)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def _maybe_compress(thread_id: str, messages: list[dict]) -> None:
    """If history is too long, compress the oldest messages into a summary."""
    if len(messages) < _SUMMARIZE_AFTER:
        return
    if len(messages) < _MAX_MESSAGES:
        return

    # Keep the newest N messages, summarize the rest
    keep = messages[-_SUMMARIZE_AFTER:]
    oldest = messages[:-_SUMMARIZE_AFTER]

    summary = _summarize(oldest, thread_id)
    compressed = [{"role": "system", "content": f"[Earlier conversation summary: {summary}]"}]
    compressed.extend(keep)
    _save(thread_id, compressed)
    print(f"📝 Thread {thread_id[:8]} compressed: {len(oldest)} msgs → summary")


def _summarize(messages: list[dict], thread_id: str) -> str:
    """Summarize old messages into a brief overview.

    Uses a local heuristic (extracts key topics) rather than calling the
    LLM, to avoid cost and latency.
    """
    # Build a concise text summary from user queries and assistant responses
    user_qs = [m["content"][:80] for m in messages if m.get("role") == "user"]
    asst_topics = [m["content"][:120] for m in messages if m.get("role") == "assistant" and len(m.get("content", "")) > 10]

    lines = [f"Earlier in this conversation ({len(messages)} messages):"]
    if user_qs:
        lines.append("User asked about: " + "; ".join(user_qs[:6]))
    if asst_topics:
        lines.append("Key points discussed: " + "; ".join(asst_topics[:4]))

    return " ".join(lines)


def get_workdir(thread_id: str) -> str | None:
    """Return the working directory for a thread, or None."""
    path = _thread_path(thread_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        return data.get("workdir")
    except (json.JSONDecodeError, OSError):
        return None


def set_workdir(thread_id: str, workdir: str) -> None:
    """Set the working directory for a thread."""
    path = _thread_path(thread_id)
    try:
        if path.exists():
            data = json.loads(path.read_text())
        else:
            data = {"thread_id": thread_id, "messages": [], "updated_at": time.time()}
        data["workdir"] = workdir
        data["updated_at"] = time.time()
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    except (OSError, json.JSONDecodeError):
        # Create fresh
        data = {"thread_id": thread_id, "messages": [], "updated_at": time.time(), "workdir": workdir}
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def list_threads() -> list[dict]:
    """Return metadata for all threads (newest first)."""
    threads: list[dict] = []
    for path in sorted(_THREADS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text())
            messages = data.get("messages", [])
            first_user = next((m["content"][:80] for m in messages if m.get("role") == "user"), None)
            preview = first_user or "(empty thread)"
            threads.append({
                "thread_id": data.get("thread_id", path.stem),
                "message_count": len(messages),
                "updated_at": data.get("updated_at", path.stat().st_mtime),
                "preview": preview,
            })
        except (json.JSONDecodeError, OSError, KeyError):
            continue
    return threads


def delete_thread(thread_id: str) -> None:
    """Remove a thread and all its messages."""
    path = _thread_path(thread_id)
    if path.exists():
        path.unlink()
