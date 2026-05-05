"""Provider configuration persistence — reads/writes .config/providers_config.json."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

_CONFIG_DIR = Path(__file__).resolve().parent.parent / ".config"
_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = _CONFIG_DIR / "providers_config.json"
_CONFIG_CACHE: list[dict[str, Any]] | None = None


def make_entry(name="", provider="openai", model="", api_key="", base_url="", entry_id=None) -> dict:
    return {"id": entry_id or uuid.uuid4().hex[:12], "name": name, "provider": provider, "model": model, "api_key": api_key, "base_url": base_url}


def load_configs() -> list[dict]:
    global _CONFIG_CACHE
    if not CONFIG_FILE.exists():
        configs = _defaults()
        _write(configs)
        _CONFIG_CACHE = configs
        return configs
    try:
        raw = json.loads(CONFIG_FILE.read_text())
        configs = raw if isinstance(raw, list) else raw.get("configs", [])
        _CONFIG_CACHE = configs
        return configs
    except (json.JSONDecodeError, KeyError, OSError):
        configs = _defaults()
        _CONFIG_CACHE = configs
        return configs


def save_configs(configs: list[dict]) -> None:
    _write(configs)
    _CONFIG_CACHE = configs


def _write(configs: list[dict]) -> None:
    CONFIG_FILE.write_text(json.dumps({"configs": configs}, indent=2, ensure_ascii=False))


def _defaults() -> list[dict]:
    import os
    configs = []
    for key, provider, model, base_url in [
        ("ANTHROPIC_API_KEY", "anthropic", "claude-sonnet-4-20250514", ""),
        ("OPENAI_API_KEY", "openai", "gpt-4o", ""),
        ("DEEPSEEK_API_KEY", "deepseek", "deepseek-chat", "https://api.deepseek.com"),
    ]:
        ak = os.environ.get(key, "")
        if ak:
            configs.append(make_entry(provider=provider, model=model, api_key=ak, base_url=base_url, name=provider.title()))
    configs.append(make_entry(provider="ollama", model="llama3.2", base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"), name="Ollama (local)"))
    return configs


def get_config_by_id(config_id: str) -> dict | None:
    for c in load_configs():
        if c["id"] == config_id:
            return c
    return None
