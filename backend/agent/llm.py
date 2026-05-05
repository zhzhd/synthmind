"""Multi-LLM provider factory.

Supports Anthropic, OpenAI, DeepSeek, and Ollama with a unified
interface. Each constructor accepts optional ``api_key`` and
``base_url`` overrides; if omitted it falls back to environment
variables.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from langchain_core.language_models.chat_models import BaseChatModel

load_dotenv()


# ── Provider registry ──────────────────────────────────────────────

PROVIDER_TYPES = ["anthropic", "openai", "deepseek", "ollama"]

PROVIDER_MODELS: dict[str, list[str]] = {
    "anthropic": [
        "claude-sonnet-4-20250514",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-opus-4-20250514",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "o3-mini",
    ],
    "deepseek": [
        "deepseek-chat",
        "deepseek-reasoner",
    ],
    "ollama": [
        "llama3.2",
        "llama3.1",
        "mistral",
        "qwen2.5",
    ],
}

DEFAULT_BASE_URLS: dict[str, str] = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com",
    "ollama": "http://localhost:11434",
}

ENV_KEY_MAP: dict[str, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "ollama": "",  # no key needed
}


# ── Factory ────────────────────────────────────────────────────────

def get_chat_model(
    provider: str,
    model: str,
    api_key: str | None = None,
    base_url: str | None = None,
    **kwargs,
) -> BaseChatModel:
    """Create a LangChain chat model.

    Args:
        provider: ``anthropic``, ``openai``, ``deepseek``, or ``ollama``.
        model: Model name.
        api_key: Override (falls back to env var if empty).
        base_url: Override (falls back to default if empty).
        **kwargs: Extra args (temperature, max_tokens, etc.).

    Returns:
        A LangChain BaseChatModel instance.
    """
    provider = provider.lower()

    if provider not in PROVIDER_TYPES:
        raise ValueError(f"Unknown provider '{provider}'. Use: {', '.join(PROVIDER_TYPES)}")

    # Resolve api_key and base_url
    resolved_key = api_key or os.getenv(ENV_KEY_MAP.get(provider, ""), "") or None
    resolved_url = base_url or DEFAULT_BASE_URLS.get(provider, "") or None

    # Strip common kwargs that LangChain constructors don't expect
    temperature = kwargs.pop("temperature", 0.7)
    max_tokens = kwargs.pop("max_tokens", 4096)
    timeout = kwargs.pop("timeout", 60)

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        opts = dict(model=model, temperature=temperature, max_tokens=max_tokens, timeout=timeout, **kwargs)
        if resolved_key:
            opts["api_key"] = resolved_key
        return ChatAnthropic(**opts)

    elif provider in ("openai", "deepseek"):
        from langchain_openai import ChatOpenAI

        if provider == "deepseek":
            # Use a subclass that captures reasoning_content from thinking mode
            return _deepseek_chat(model, temperature, max_tokens, timeout, resolved_key, resolved_url, kwargs)
        else:
            opts = dict(model=model, temperature=temperature, max_tokens=max_tokens, timeout=timeout, **kwargs)
            if resolved_key:
                opts["api_key"] = resolved_key
            if resolved_url:
                opts["base_url"] = resolved_url
            return ChatOpenAI(**opts)

    elif provider == "ollama":
        from langchain_ollama import ChatOllama
        opts = dict(model=model, temperature=temperature, num_predict=max_tokens, **kwargs)
        if resolved_url:
            opts["base_url"] = resolved_url
        return ChatOllama(**opts)

    raise ValueError(f"Unhandled provider: {provider}")


# ── Available providers (for UI selector) ──────────────────────────

# ── DeepSeek thinking-mode support ─────────────────────────────────

def _deepseek_chat(model: str, temperature: int, max_tokens: int,
                   timeout: int, api_key: str | None, base_url: str | None,
                   extra_kwargs: dict):
    """Create a ChatOpenAI for DeepSeek that captures reasoning_content.

    DeepSeek reasoning models return ``reasoning_content`` in the raw
    API response, but LangChain's ChatOpenAI doesn't propagate it.
    We use the ``openai`` client directly to have full control over
    message serialization and response parsing.
    """
    import openai
    from langchain_core.language_models.chat_models import BaseChatModel
    from langchain_core.messages import AIMessage, BaseMessage, ToolCall
    from langchain_core.outputs import ChatGeneration, ChatResult
    from langchain_core.callbacks import CallbackManagerForLLMRun

    client = openai.OpenAI(
        api_key=api_key,
        base_url=base_url or "https://api.deepseek.com",
        timeout=timeout,
    )

    class _DeepSeekDirect(BaseChatModel):
        """Custom ChatModel that handles DeepSeek thinking mode correctly."""

        model_name: str = ""
        temperature: float = 0.7
        max_tokens: int = 4096
        _tools: list | None = None

        def __init__(self, **kwargs):
            super().__init__(
                model_name=model,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs,
            )

        def bind_tools(self, tools: list):
            self._tools = tools
            return self

        def _generate(
            self,
            messages: list[BaseMessage],
            stop: list[str] | None = None,
            run_manager: CallbackManagerForLLMRun | None = None,
            **kwargs,
        ) -> ChatResult:
            import json

            # Convert LangChain messages → DeepSeek API format
            api_messages = []
            for m in messages:
                d = {"role": _role(m), "content": m.content or ""}
                if isinstance(m, AIMessage):
                    # Preserve reasoning_content from previous turns
                    extra = getattr(m, "additional_kwargs", {}) or {}
                    if "reasoning_content" in extra:
                        d["reasoning_content"] = extra["reasoning_content"]
                    # Tool calls: LangChain format → API format
                    if m.tool_calls:
                        d["tool_calls"] = []
                        for tc in m.tool_calls:
                            if isinstance(tc, dict):
                                d["tool_calls"].append({
                                    "id": tc["id"],
                                    "type": "function",
                                    "function": {
                                        "name": tc["name"],
                                        "arguments": json.dumps(tc["args"]) if isinstance(tc["args"], dict) else str(tc["args"]),
                                    },
                                })
                elif _role(m) == "tool":
                    d["tool_call_id"] = m.tool_call_id if hasattr(m, "tool_call_id") else ""

                api_messages.append(d)

            # Build create() kwargs
            create_kwargs = dict(
                model=self.model_name,
                messages=api_messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
            if stop:
                create_kwargs["stop"] = stop
            if self._tools:
                create_kwargs["tools"] = [
                    {"type": "function", "function": {"name": t.name, "description": t.description or "", "parameters": t.args_schema.schema() if hasattr(t, 'args_schema') and t.args_schema else {"type": "object", "properties": {}}}}
                    for t in self._tools
                ]

            # Call the API
            response = client.chat.completions.create(**create_kwargs)

            choice = response.choices[0]
            msg = choice.message

            # Build AIMessage
            ai_kwargs = {"content": msg.content or ""}
            additional_kwargs = {}
            if hasattr(msg, "reasoning_content") and msg.reasoning_content:
                additional_kwargs["reasoning_content"] = msg.reasoning_content
                print(f"🧠 Captured reasoning_content ({len(str(msg.reasoning_content))} chars)")
            if additional_kwargs:
                ai_kwargs["additional_kwargs"] = additional_kwargs
            if msg.tool_calls:
                # OpenAI tool_call format → LangChain format
                ai_kwargs["tool_calls"] = []
                for tc in msg.tool_calls:
                    try:
                        args = json.loads(tc.function.arguments) if isinstance(tc.function.arguments, str) else tc.function.arguments
                    except (json.JSONDecodeError, TypeError):
                        args = {}
                    ai_kwargs["tool_calls"].append({
                        "id": tc.id,
                        "name": tc.function.name,
                        "args": args,
                        "type": "tool_call",
                    })

            return ChatResult(generations=[ChatGeneration(message=AIMessage(**ai_kwargs))])

        @property
        def _llm_type(self) -> str:
            return "deepseek-direct"

        def _default_params(self):
            return {"model": self.model_name, "temperature": self.temperature}

    return _DeepSeekDirect()


def _role(message) -> str:
    """Get the role string from a LangChain message."""
    if message.type in ("human", "user"):
        return "user"
    if message.type == "ai":
        return "assistant"
    if message.type == "tool":
        return "tool"
    if message.type == "system":
        return "system"
    return message.type


def available_providers() -> list[dict]:
    """Return which providers/models are usable based on env vars."""
    models = []

    for prov in PROVIDER_TYPES:
        env_key = ENV_KEY_MAP[prov]
        has_key = not env_key or bool(os.getenv(env_key))

        if prov == "ollama" or has_key:
            for m in PROVIDER_MODELS[prov]:
                models.append({"provider": prov, "model": m, "available": True})
        else:
            models.append({"provider": prov, "model": "", "available": False})

    return models
