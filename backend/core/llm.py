"""LLM provider factory — routes by provider name to the right module."""

from __future__ import annotations

import os

from dotenv import load_dotenv
from langchain_core.language_models.chat_models import BaseChatModel

load_dotenv()

PROVIDER_MODELS: dict[str, list[str]] = {
    "deepseek": ["deepseek-v4-flash", "deepseek-v4-pro"],
}

ENV_KEY_MAP: dict[str, str] = {
    "deepseek": "DEEPSEEK_API_KEY",
}

IMPORT_MAP: dict[str, str] = {
    "deepseek": "core.providers.deepseek",
}


def get_chat_model(provider: str, model: str, api_key: str | None = None, base_url: str | None = None, **kwargs) -> BaseChatModel:
    """Create a LangChain chat model for the given provider."""
    provider = provider.lower()
    if provider not in IMPORT_MAP:
        raise ValueError(f"Unknown provider '{provider}'. Use: {', '.join(IMPORT_MAP)}")

    resolved_key = api_key or os.getenv(ENV_KEY_MAP.get(provider, ""), "") or None
    resolved_url = base_url or None  # providers have defaults

    import importlib
    mod = importlib.import_module(IMPORT_MAP[provider])
    return mod.create(model, api_key=resolved_key, base_url=resolved_url, **kwargs)


def available_providers() -> list[dict]:
    """Return which providers/models are usable based on env vars."""
    models = []
    for prov in IMPORT_MAP:
        env_key = ENV_KEY_MAP[prov]
        has_key = not env_key or os.getenv(env_key)
        for m in PROVIDER_MODELS[prov]:
            models.append({"provider": prov, "model": m, "available": bool(has_key)})
    return models
