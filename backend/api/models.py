"""GET /api/models, GET /api/health."""

from fastapi import APIRouter

from core.llm import available_providers
from core.state import ModelsResponse
from services.provider_config import load_configs

router = APIRouter()


@router.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@router.get("/api/models", response_model=ModelsResponse)
async def list_models():
    models = available_providers()
    for cfg in load_configs():
        exists = any(m["provider"] == cfg["provider"] and m["model"] == cfg["model"] for m in models)
        if not exists:
            models.append({"provider": cfg["provider"], "model": cfg["model"], "available": bool(cfg.get("api_key") or cfg["provider"] == "ollama")})
    return ModelsResponse(models=models)
