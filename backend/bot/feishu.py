"""Feishu bot adapter stub.

Required by api/server.py import. Actual Feishu bot integration
requires lark-oapi SDK and proper configuration.
"""

from __future__ import annotations

from bot.base import BotAdapter


class FeishuBot(BotAdapter):
    """Stub Feishu bot — placeholder for full implementation."""

    def __init__(self) -> None:
        super().__init__()

    async def start(self) -> None:
        print("[FeishuBot] Stub loaded — bot not fully configured")
        # Real implementation would initialize lark-oapi WSClient here

    async def handle_webhook(self, body: dict) -> dict:
        return {"code": 0}
