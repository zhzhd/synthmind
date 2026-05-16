"""FastAPI app initialization and router registration."""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

HOST = "127.0.0.1"
PORT = 8000
BOT_MODE = os.getenv("BOT_MODE", "").lower()
_bot_task = None
_bot_instance = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bot_task
    print(f"🟢 SynthMind backend starting on {HOST}:{PORT}")

    # Start bot if configured
    if BOT_MODE == "feishu":
        _bot_task = asyncio.create_task(_start_bot())

        # Register webhook endpoint
        @app.post("/api/feishu/webhook")
        async def feishu_webhook(req: Request):
            import json
            body = await req.json()

            # Card action challenge
            if "challenge" in body:
                return {"challenge": body["challenge"]}

            # URL verification
            if body.get("type") == "url_verification":
                return {"challenge": body.get("challenge", "")}

            if _bot_task and _bot_task.done():
                print(f"🟡 Bot task finished, re-creating...")
                _bot_task = asyncio.create_task(_start_bot())

            from bot.feishu import FeishuBot
            # Find the bot instance from the task
            global _bot_instance
            try:
                if _bot_instance:
                    return await _bot_instance.handle_webhook(body) or {"code": 0}
            except Exception as e:
                print(f"[FeishuBot] Webhook error: {e}")
            return {"code": 0}

    yield

    print("🟡 SynthMind backend stopped")
    if _bot_task:
        _bot_task.cancel()


async def _start_bot():
    """Start the configured IM bot."""
    global _bot_instance
    bot_map = {"feishu": ("bot.feishu", "FeishuBot")}
    if BOT_MODE not in bot_map:
        print(f"⚠️  Unknown BOT_MODE: {BOT_MODE}")
        return

    mod_path, cls_name = bot_map[BOT_MODE]
    try:
        import importlib
        mod = importlib.import_module(mod_path)
        bot_cls = getattr(mod, cls_name)
        _bot_instance = bot_cls()
        print(f"🤖 Bot started: {BOT_MODE}")
        await _bot_instance.start()
    except ImportError as e:
        print(f"⚠️  Bot {BOT_MODE}: import error — {e}")
    except Exception as e:
        print(f"🟡 Bot stopped: {e}")
        import traceback
        traceback.print_exc()


app = FastAPI(title="SynthMind API", version="0.1.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Register routers
from api.chat import router as chat_router
from api.models import router as models_router
from api.configs import router as configs_router
from api.skills_api import router as skills_router
from api.approve import router as approve_router
from api.todos import router as todos_router
from api.threads import router as threads_router
from api.sandbox import router as sandbox_router
from api.memory import router as memory_router
from api.agents_api import router as agents_router
from api.whitelist import router as whitelist_router
from api.tracing import router as tracing_router
from api.chat_stream import router as chat_stream_router
from api.balance import router as balance_router
from api.files import router as files_router
from api.git import router as git_router
from bot.feishu import FeishuBot

app.include_router(chat_router)
app.include_router(models_router)
app.include_router(configs_router)
app.include_router(skills_router)
app.include_router(approve_router)
app.include_router(todos_router)
app.include_router(threads_router)
app.include_router(sandbox_router)
app.include_router(memory_router)
app.include_router(agents_router)
app.include_router(whitelist_router)
app.include_router(tracing_router)
app.include_router(chat_stream_router)
app.include_router(balance_router)
app.include_router(files_router)
app.include_router(git_router)
