"""Feishu bot config persistence — reads/writes .config/feishu_config.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CONFIG_DIR = Path(__file__).resolve().parent.parent / ".config"
_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = _CONFIG_DIR / "feishu_config.json"


def load() -> dict[str, Any]:
    if not CONFIG_FILE.exists():
        return {"app_id": "", "app_secret": "", "bot_name": ""}
    try:
        return json.loads(CONFIG_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {"app_id": "", "app_secret": "", "bot_name": ""}


def save(cfg: dict[str, Any]) -> None:
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
