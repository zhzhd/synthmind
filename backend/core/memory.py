"""Cross-session memory: save, index, and retrieve learned knowledge.

Mirrors Claude Code's Auto Memory pattern:
  - Agent autonomously writes observations during conversation
  - On each turn, relevant past memories are injected into context
  - Users can view/manage memories via API/frontend
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

# ── Config ─────────────────────────────────────────────────────────────

MEMORY_DIR = Path(__file__).resolve().parent.parent / ".config" / "memory"
MEMORY_INDEX = MEMORY_DIR / "index.json"
_MAX_INDEX_ENTRIES = 200
_MAX_INJECT = 5
_SCORE_CACHE_MAX = 100

MEMORY_TYPES = ("user", "feedback", "project", "reference")


# ── Data model ─────────────────────────────────────────────────────────

@dataclass
class MemoryEntry:
    type: str                 # "user" | "feedback" | "project" | "reference"
    content: str              # The actual knowledge
    tags: list[str] = field(default_factory=list)
    situation: str = ""       # Optional — what prompted this memory
    priority: int = 3         # 1-5, higher = more likely to inject
    id: str = ""
    created_at: float = 0.0
    updated_at: float = 0.0

    def __post_init__(self):
        if not self.id:
            ts = int(time.time() * 1000)
            self.id = f"mem_{ts:x}"
        if not self.created_at:
            self.created_at = time.time()
        if not self.updated_at:
            self.updated_at = self.created_at


# ── Storage ────────────────────────────────────────────────────────────

def _ensure_dir() -> None:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)


def _load_index() -> dict[str, Any]:
    _ensure_dir()
    if MEMORY_INDEX.exists():
        try:
            return json.loads(MEMORY_INDEX.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_index(idx: dict) -> None:
    _ensure_dir()
    MEMORY_INDEX.write_text(
        json.dumps(idx, indent=2, ensure_ascii=False, sort_keys=True)
    )


def _entry_path(eid: str) -> Path:
    return MEMORY_DIR / f"{eid}.json"


def save_memory(
    mem_type: str,
    content: str,
    tags: list[str] | None = None,
    situation: str = "",
    priority: int = 3,
) -> MemoryEntry:
    """Persist a new memory entry and update the index."""
    assert mem_type in MEMORY_TYPES, f"Invalid type: {mem_type}, use {MEMORY_TYPES}"
    entry = MemoryEntry(
        type=mem_type,
        content=content,
        tags=tags or [],
        situation=situation,
        priority=max(1, min(5, priority)),
    )
    _ensure_dir()
    _entry_path(entry.id).write_text(
        json.dumps(asdict(entry), indent=2, ensure_ascii=False)
    )
    # Update index
    idx = _load_index()
    idx[entry.id] = {
        "type": entry.type,
        "content": entry.content[:120],
        "tags": entry.tags,
        "priority": entry.priority,
        "created_at": entry.created_at,
    }
    # Enforce max index size — drop lowest-priority oldest entries
    if len(idx) > _MAX_INDEX_ENTRIES:
        sorted_ids = sorted(
            idx.keys(),
            key=lambda eid: (idx[eid].get("priority", 1), idx[eid].get("created_at", 0)),
        )
        for stale_id in sorted_ids[: len(idx) - _MAX_INDEX_ENTRIES]:
            idx.pop(stale_id, None)
            _entry_path(stale_id).unlink(missing_ok=True)
    _save_index(idx)
    return entry


def delete_memory(memory_id: str) -> bool:
    """Remove a memory entry by id."""
    idx = _load_index()
    removed = idx.pop(memory_id, None) is not None
    if removed:
        _save_index(idx)
        _entry_path(memory_id).unlink(missing_ok=True)
    return removed


def list_memories(mem_type: str | None = None) -> list[dict]:
    """Return all index entries, newest first, optionally filtered by type."""
    idx = _load_index()
    entries = []
    for eid, meta in idx.items():
        if mem_type and meta.get("type") != mem_type:
            continue
        entries.append({"id": eid, **meta})
    entries.sort(key=lambda e: e.get("created_at", 0), reverse=True)
    return entries


# ── Retrieval (keyword-based scoring, no vector DB needed) ─────────────

def _tokenize(text: str) -> set[str]:
    """Lowercase, split on non-alphanum, filter short noise."""
    tokens = re.split(r"[^a-zA-Z0-9一-鿿]+", text.lower())
    return {t for t in tokens if len(t) > 1}


def _score_entry(query_tokens: set[str], meta: dict) -> float:
    """Score a memory entry's relevance to a query (0-1)."""
    content = meta.get("content", "")
    tag_str = " ".join(meta.get("tags", []))
    text = content + " " + tag_str
    tokens = _tokenize(text)
    if not tokens:
        return 0.0

    matches = query_tokens & tokens
    if not matches:
        return 0.0

    raw = len(matches) / max(len(tokens), 1)
    priority_boost = 1.0 + (meta.get("priority", 3) - 1) * 0.15
    return min(raw * priority_boost, 1.0)


def get_relevant_memories(query: str, max_results: int = _MAX_INJECT) -> list[dict]:
    """Return top-N memory entries relevant to a query string."""
    idx = _load_index()
    if not idx:
        return []
    qt = _tokenize(query)
    scored: list[tuple[float, str, dict]] = []
    for eid, meta in idx.items():
        score = _score_entry(qt, meta)
        if score > 0:
            scored.append((score, eid, meta))
    scored.sort(key=lambda x: x[0], reverse=True)
    results = []
    for score, eid, meta in scored[:max_results]:
        ep = _entry_path(eid)
        full = {}
        if ep.exists():
            try:
                full = json.loads(ep.read_text())
            except (json.JSONDecodeError, OSError):
                full = meta
        else:
            full = meta
        full["_score"] = round(score, 3)
        results.append(full)
    return results


# ── Memory system prompt injection ─────────────────────────────────────

def format_memory_context(query: str) -> str:
    """Build a markdown snippet of relevant memories for system prompt injection."""
    memories = get_relevant_memories(query)
    if not memories:
        return ""
    lines = ["\n\n## Relevant Past Memory"]
    for i, m in enumerate(memories, 1):
        mtype = m.get("type", "?")
        content = m.get("content", "")
        lines.append(f"[{i}] ({mtype}) {content}")
    lines.append("(The above are notes from past sessions. Consider them if relevant.)\n")
    return "\n".join(lines)
