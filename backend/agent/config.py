"""Provider configuration manager.

Stores provider configurations (API key, base URL, model name) in a
JSON file so users can manage them from the UI instead of editing .env.

Uses plain dicts internally to avoid Pydantic v2 compatibility issues
with Python 3.9 (ABC/Generic MRO errors).
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

# ── Storage path ───────────────────────────────────────────────────
_CONFIG_DIR = Path(__file__).resolve().parent.parent / ".config"
_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = _CONFIG_DIR / "providers_config.json"

_CONFIG_CACHE: list[dict[str, Any]] | None = None


# ── Public helpers ─────────────────────────────────────────────────

def make_entry(
    name: str = "",
    provider: str = "openai",
    model: str = "",
    api_key: str = "",
    base_url: str = "",
    entry_id: str | None = None,
) -> dict[str, Any]:
    """Create a new config dict with an auto-generated ID."""
    return {
        "id": entry_id or uuid.uuid4().hex[:12],
        "name": name,
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "base_url": base_url,
    }


# ── Load / Save ────────────────────────────────────────────────────

def load_configs() -> list[dict[str, Any]]:
    """Load provider configs from the JSON file."""
    global _CONFIG_CACHE

    if not CONFIG_FILE.exists():
        configs = _default_configs()
        # Write defaults to disk so they persist
        _write_raw(configs)
        _CONFIG_CACHE = configs
        return configs

    try:
        raw = json.loads(CONFIG_FILE.read_text())
        configs = raw if isinstance(raw, list) else raw.get("configs", [])
        _CONFIG_CACHE = configs
        return configs
    except (json.JSONDecodeError, KeyError, OSError):
        configs = _default_configs()
        _CONFIG_CACHE = configs
        return configs


def save_configs(configs: list[dict[str, Any]]) -> None:
    """Persist provider configs to the JSON file."""
    _write_raw(configs)
    _CONFIG_CACHE = configs
    print(f"💾 Provider config saved ({len(configs)} entries)")


def _write_raw(configs: list[dict[str, Any]]) -> None:
    """Write the config list to the JSON file."""
    CONFIG_FILE.write_text(
        json.dumps({"configs": configs}, indent=2, ensure_ascii=False),
    )


# ── Defaults ───────────────────────────────────────────────────────

def _default_configs() -> list[dict[str, Any]]:
    """Return built-in defaults based on environment variables."""
    configs: list[dict[str, Any]] = []

    ak = os.environ.get("ANTHROPIC_API_KEY", "")
    if ak:
        configs.append(make_entry(
            name="Claude Sonnet", provider="anthropic",
            model="claude-sonnet-4-20250514", api_key=ak,
        ))

    ok = os.environ.get("OPENAI_API_KEY", "")
    if ok:
        configs.append(make_entry(
            name="GPT-4o", provider="openai",
            model="gpt-4o", api_key=ok,
        ))

    dk = os.environ.get("DEEPSEEK_API_KEY", "")
    if dk:
        configs.append(make_entry(
            name="DeepSeek Chat", provider="deepseek",
            model="deepseek-chat", api_key=dk,
            base_url="https://api.deepseek.com",
        ))

    configs.append(make_entry(
        name="Ollama (local)", provider="ollama",
        model="llama3.2",
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
    ))

    return configs


# ── Lookup ─────────────────────────────────────────────────────────

def get_config_by_id(config_id: str) -> dict[str, Any] | None:
    """Look up a single config entry by ID."""
    for c in load_configs():
        if c["id"] == config_id:
            return c
    return None
