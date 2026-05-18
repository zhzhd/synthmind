"""Feishu bot adapter using lark-oapi WSClient.

Connects to Feishu via WebSocket for real-time messages,
forwards to agent, and sends responses back.
"""

from __future__ import annotations

import asyncio
import json
import os
import time

import httpx

from bot.base import BotAdapter
from services.feishu_config import load as load_feishu_config

FEISHU_OPEN_API = "https://open.feishu.cn/open-apis"
TOKEN_EXPIRE_BUFFER = 60  # refresh token 60s before expiry


class FeishuBot(BotAdapter):
    """Feishu bot — lark-oapi WebSocket client for message/approval handling."""

    def __init__(self) -> None:
        super().__init__()
        self._ws_client = None
        self._app_id = ""
        self._app_secret = ""
        self._bot_name = ""
        self._token = ""
        self._token_expires_at = 0.0
        self._chat_threads: dict[str, str] = {}  # chat_id -> thread_id

    async def start(self) -> None:
        cfg = load_feishu_config()
        self._app_id = cfg.get("app_id", "")
        self._app_secret = cfg.get("app_secret", "")
        self._bot_name = cfg.get("bot_name", "FeishuBot")

        print(f"[FeishuBot] Starting bot '{self._bot_name}' ...")
        print(f"[FeishuBot] app_id={self._app_id}")
        if not self._app_id or not self._app_secret:
            print("[FeishuBot] ⚠️  app_id or app_secret is empty — bot cannot start")
            print("[FeishuBot] Configure Feishu bot in Settings → Feishu Bot Configuration")
            return

        try:
            from lark_oapi.ws import Client as WSClient
            from lark_oapi import EventDispatcherHandler
            from lark_oapi.core.enum import LogLevel

            handler = EventDispatcherHandler.builder("", "").register_p2_im_message_receive_v1(
                self._on_message
            ).build()

            log_level = getattr(LogLevel, os.getenv("BOT_LOG_LEVEL", "INFO").upper(), LogLevel.INFO)

            self._ws_client = WSClient(
                app_id=self._app_id,
                app_secret=self._app_secret,
                event_handler=handler,
                log_level=log_level,
            )

            await self._ws_client._connect()
            asyncio.create_task(self._ws_client._ping_loop())
            print(f"[FeishuBot] ✅ Bot connected via WebSocket")
            print(f"[FeishuBot] Listening for messages in chats ...")

        except ImportError as e:
            print(f"[FeishuBot] ⚠️  lark-oapi import error: {e}")
            print("[FeishuBot] Install with: pip install lark-oapi")

        except Exception as e:
            print(f"[FeishuBot] ❌ Failed to start: {e}")
            import traceback
            traceback.print_exc()

    # ── Feishu API helpers ──────────────────────────────────

    async def _ensure_token(self) -> str | None:
        """Get or refresh tenant access token."""
        if self._token and time.time() < self._token_expires_at - TOKEN_EXPIRE_BUFFER:
            return self._token
        try:
            async with httpx.AsyncClient() as cli:
                resp = await cli.post(
                    f"{FEISHU_OPEN_API}/auth/v3/tenant_access_token/internal",
                    json={"app_id": self._app_id, "app_secret": self._app_secret},
                )
                data = resp.json()
                if data.get("code") != 0:
                    print(f"[FeishuBot] Token error: {data}")
                    return None
                self._token = data["tenant_access_token"]
                self._token_expires_at = time.time() + data.get("expire", 7200)
                print(f"[FeishuBot] Token refreshed, expires in {data.get('expire', 7200)}s")
                return self._token
        except Exception as e:
            print(f"[FeishuBot] Token refresh failed: {e}")
            return None

    async def _send_message(self, chat_id: str, text: str, reply_msg_id: str | None = None) -> bool:
        """Send a text message to a Feishu chat."""
        token = await self._ensure_token()
        if not token:
            return False
        try:
            payload = {
                "receive_id": chat_id,
                "msg_type": "text",
                "content": json.dumps({"text": text}, ensure_ascii=False),
            }
            url = f"{FEISHU_OPEN_API}/im/v1/messages?receive_id_type=chat_id"
            async with httpx.AsyncClient() as cli:
                resp = await cli.post(url, headers={"Authorization": f"Bearer {token}"}, json=payload)
                data = resp.json()
                if data.get("code") != 0:
                    print(f"[FeishuBot] Send error: {data}")
                    return False
                return True
        except Exception as e:
            print(f"[FeishuBot] Send failed: {e}")
            return False

    async def _call_agent(self, text: str, chat_id: str) -> str:
        """Send message to the local agent and return the response."""
        thread_id = self._chat_threads.get(chat_id)
        print(f"[FeishuBot] Calling agent thread={thread_id} text={text[:200]}")
        try:
            from core.agent import run_agent
            from core.state import ModelConfig
            from services.provider_config import load_configs

            configs = load_configs()
            matched = next((c for c in configs if c.get("api_key")), None)
            if matched:
                mc = ModelConfig(
                    provider=matched["provider"],
                    model=matched["model"],
                    api_key=matched["api_key"],
                    base_url=matched.get("base_url", ""),
                )
            else:
                mc = ModelConfig(
                    provider=os.getenv("DEFAULT_LLM_PROVIDER", "anthropic"),
                    model=os.getenv("DEFAULT_LLM_MODEL", "claude-sonnet-4-20250514"),
                    api_key=os.getenv("ANTHROPIC_API_KEY", ""),
                )

            content, new_thread_id, pending, *extra = await run_agent(
                message=text,
                model_config=mc,
                thread_id=thread_id,
            )
            self._chat_threads[chat_id] = new_thread_id

            if pending:
                print(f"[FeishuBot] Agent returned pending approval: {pending}")
                return f"[需要审批] {content[:100] if content else '操作等待审批'}"

            reasoning = extra[0] if extra else ""
            response = content or "(no response)"
            print(f"[FeishuBot] Agent responded ({len(response)} chars)")
            return response

        except Exception as e:
            print(f"[FeishuBot] Agent error: {e}")
            import traceback
            traceback.print_exc()
            return f"抱歉，处理消息时出错: {e}"

    # ── Event handlers ──────────────────────────────────────

    def _on_message(self, event) -> None:
        """Synchronous callback from WSClient — spawn async task."""
        asyncio.create_task(self._handle_message(event))

    async def _handle_message(self, event) -> None:
        """Process incoming Feishu message asynchronously."""
        try:
            ev_data = getattr(event, "event", None)
            if not ev_data:
                print("[FeishuBot] Received event without event data")
                return
            sender = getattr(ev_data, "sender", None)
            msg = getattr(ev_data, "message", None)
            if not msg:
                print("[FeishuBot] Received event without message field")
                return

            msg_type = msg.message_type or "unknown"
            content_str = msg.content or ""
            chat_id = msg.chat_id or ""
            msg_id = msg.message_id or ""

            sender_id_obj = getattr(sender, "sender_id", None)
            open_id = getattr(sender_id_obj, "open_id", "") if sender_id_obj else ""
            sender_type = getattr(sender_id_obj, "type", "") if sender_id_obj else ""

            # Skip messages from the app itself (sender_type == "app")
            if sender_type == "app":
                print(f"[FeishuBot] Skipping app's own message")
                return

            print(f"[FeishuBot] Message from {open_id} (type={sender_type}) chat={chat_id} type={msg_type}")

            if msg_type != "text":
                print(f"[FeishuBot] Ignoring non-text message type: {msg_type}")
                return

            try:
                text_data = json.loads(content_str)
                text = text_data.get("text", "")
            except (json.JSONDecodeError, TypeError):
                text = content_str

            # Remove @bot mention prefix if present
            text = text.strip()
            print(f"[FeishuBot] Processing: {text[:200]}")

            # Send typing indicator
            await self._send_message(chat_id, "⏳ 正在思考...", msg_id)

            # Call agent
            response = await self._call_agent(text, chat_id)

            # Send response
            await self._send_message(chat_id, response, msg_id)
            print(f"[FeishuBot] Response sent to chat={chat_id}")

        except Exception as e:
            print(f"[FeishuBot] Error handling message: {e}")
            import traceback
            traceback.print_exc()

    async def handle_webhook(self, body: dict) -> dict:
        print(f"[FeishuBot] Webhook received: {json.dumps(body, ensure_ascii=False)[:500]}")
        return {"code": 0}
