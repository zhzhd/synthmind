"""Ollama (local) provider."""

import os
from langchain_ollama import ChatOllama
from langchain_core.language_models.chat_models import BaseChatModel


def create(model: str, base_url: str | None = None, **kwargs) -> BaseChatModel:
    url = base_url or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    return ChatOllama(
        model=model,
        base_url=url,
        temperature=kwargs.pop("temperature", 0.7),
        num_predict=kwargs.pop("max_tokens", 4096),
        **kwargs,
    )
