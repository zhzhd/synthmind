"""Tool whitelist persistence — stores approved tool names in .config/whitelist.json.

Once a tool name is whitelisted, ``check_approval`` in the agent will skip
the pending-approval queue for all future invocations of that tool.
"""

from __future__ import annotations

import json
from pathlib import Path

_WHITELIST_FILE = Path(__file__).resolve().parent.parent / ".config" / "whitelist.json"
_WHITELIST_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load() -> dict[str, bool]:
    """Read the whitelist from disk."""
    if _WHITELIST_FILE.exists():
        try:
            return json.loads(_WHITELIST_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save(data: dict[str, bool]) -> None:
    """Write the whitelist to disk."""
    _WHITELIST_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def is_whitelisted(tool_name: str) -> bool:
    """Return True if this tool name has been whitelisted."""
    return _load().get(tool_name, False)


def add_to_whitelist(tool_name: str) -> None:
    """Add a tool name to the whitelist."""
    data = _load()
    data[tool_name] = True
    _save(data)


def remove_from_whitelist(tool_name: str) -> None:
    """Remove a tool name from the whitelist."""
    data = _load()
    data.pop(tool_name, None)
    _save(data)


def list_whitelist() -> list[str]:
    """Return all currently whitelisted tool names, alphabetically sorted."""
    return sorted(_load().keys())
