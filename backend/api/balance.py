"""Balance API — GET /api/balance returns DeepSeek account balance."""

from __future__ import annotations

import os

from fastapi import APIRouter

from services.balance import fetch_deepseek_balance

router = APIRouter()


@router.get("/api/balance")
async def get_balance():
    """Return the DeepSeek account balance, or None if unavailable."""
    data = fetch_deepseek_balance()
    if data is None:
        return {"balance": None}
    # Simplify: extract total_balance from the first currency
    infos = data.get("balance_infos", [])
    if infos:
        return {
            "balance": {
                "currency": infos[0].get("currency", "CNY"),
                "total_balance": infos[0].get("total_balance", "0"),
                "is_available": data.get("is_available", False),
            }
        }
    return {"balance": None}
