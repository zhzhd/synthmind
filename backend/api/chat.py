"""Chat endpoints — POST /api/chat, WS /ws/chat."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from core.agent import run_agent
from core.state import ChatRequest, ChatResponse, ModelConfig
from services.provider_config import load_configs

router = APIRouter()


@router.post("/api/chat")
async def chat(req: ChatRequest):
    model_config = req.llm_config
    configs = load_configs()
    matched = None

    if req.config_id:
        matched = next((c for c in configs if c["id"] == req.config_id), None)
    elif not model_config.api_key:
        matched = next((c for c in configs if c["provider"] == model_config.provider and c["model"] == model_config.model and c.get("api_key")), None)

    if matched:
        model_config = ModelConfig(provider=matched["provider"], model=matched["model"], api_key=matched["api_key"], base_url=matched["base_url"], temperature=model_config.temperature, max_tokens=model_config.max_tokens)

    content, thread_id, pending = await run_agent(message=req.message, model_config=model_config, system_prompt=req.system_prompt, thread_id=req.thread_id)
    if pending:
        return {"type": "approval", "thread_id": thread_id, "pending": pending}
    return {"type": "response", "message": content, "thread_id": thread_id}
