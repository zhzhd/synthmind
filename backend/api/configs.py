"""Provider config CRUD endpoints."""

from __future__ import annotations

import traceback

from fastapi import APIRouter, HTTPException

from core.llm import get_chat_model
from services.provider_config import load_configs, save_configs, make_entry

router = APIRouter()


@router.get("/api/configs")
async def list_configs():
    return {"configs": load_configs()}


@router.post("/api/configs")
async def create_config(cfg: dict):
    try:
        configs = load_configs()
        entry = make_entry(name=cfg.get("name", ""), provider=cfg.get("provider", "openai"), model=cfg.get("model", ""), api_key=cfg.get("api_key", ""), base_url=cfg.get("base_url", ""))
        configs.append(entry)
        save_configs(configs)
        return entry
    except Exception as e:
        traceback.print_exc()
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.put("/api/configs/{config_id}")
async def update_config(config_id: str, cfg: dict):
    configs = load_configs()
    for i, c in enumerate(configs):
        if c["id"] == config_id:
            configs[i] = {"id": config_id, "name": cfg.get("name", ""), "provider": cfg.get("provider", "openai"), "model": cfg.get("model", ""), "api_key": cfg.get("api_key", ""), "base_url": cfg.get("base_url", "")}
            save_configs(configs)
            return configs[i]
    raise HTTPException(404, f"Config {config_id} not found")


@router.delete("/api/configs/{config_id}")
async def delete_config(config_id: str):
    configs = load_configs()
    new = [c for c in configs if c["id"] != config_id]
    if len(new) == len(configs):
        raise HTTPException(404, f"Config {config_id} not found")
    save_configs(new)
    return {"ok": True}


@router.post("/api/configs/test")
async def test_config(cfg: dict):
    import asyncio
    try:
        llm = get_chat_model(provider=cfg.get("provider", "openai"), model=cfg.get("model", ""), api_key=cfg.get("api_key", ""), base_url=cfg.get("base_url", ""), temperature=0, max_tokens=32)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, llm.invoke, "Respond with 'ok'.")
        return {"ok": True, "response": result.content[:100]}
    except Exception as e:
        traceback.print_exc()
        return {"ok": False, "error": str(e)}
