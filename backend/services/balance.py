"""DeepSeek balance query — GET https://api.deepseek.com/user/balance."""

from __future__ import annotations

import os
from typing import Any

import requests


def fetch_deepseek_balance(api_key: str | None = None) -> dict[str, Any] | None:
    """Query the DeepSeek API for account balance.

    Returns the JSON response body, or None on error.
    """
    key = api_key or os.getenv("DEEPSEEK_API_KEY")
    if not key:
        return None

    try:
        resp = requests.get(
            "https://api.deepseek.com/user/balance",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {key}",
            },
            timeout=10,
        )
        if resp.ok:
            return resp.json()
        return None
    except Exception:
        return None
