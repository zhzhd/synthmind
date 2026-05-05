"""Anthropic Claude provider."""

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models.chat_models import BaseChatModel


def create(model: str, api_key: str | None = None, **kwargs) -> BaseChatModel:
    opts = dict(
        model=model,
        temperature=kwargs.pop("temperature", 0.7),
        max_tokens=kwargs.pop("max_tokens", 4096),
        timeout=kwargs.pop("timeout", 60),
        **kwargs,
    )
    if api_key:
        opts["api_key"] = api_key
    return ChatAnthropic(**opts)
