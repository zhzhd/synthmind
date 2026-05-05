"""LLM provider factory — routes by provider name to the right module."""

from __future__ import annotations

import os

from dotenv import load_dotenv
from langchain_core.language_models.chat_models import BaseChatModel

load_dotenv()

PROVIDER_MODELS: dict[str, list[str]] = {
    "anthropic": ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-opus-4-20250514"],
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"],
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "ollama": ["llama3.2", "llama3.1", "mistral", "qwen2.5"],
}

ENV_KEY_MAP: dict[str, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "ollama": "",
}

IMPORT_MAP: dict[str, str] = {
    "anthropic": "core.providers.anthropic",
    "openai": "core.providers.openai",
    "deepseek": "core.providers.deepseek",
    "ollama": "core.providers.ollama",
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
        has_key = not env_key or bool(os.getenv(env_key))
        if prov == "ollama" or has_key:
            for m in PROVIDER_MODELS[prov]:
                models.append({"provider": prov, "model": m, "available": True})
        else:
            models.append({"provider": prov, "model": "", "available": False})
    return models
