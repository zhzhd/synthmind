"""DeepSeek provider — handles thinking mode + reasoning_content."""

from __future__ import annotations

import json

import openai
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult


def create(model: str, api_key: str | None = None, base_url: str | None = None, **kwargs) -> BaseChatModel:
    client = openai.OpenAI(
        api_key=api_key,
        base_url=base_url or "https://api.deepseek.com",
        timeout=kwargs.pop("timeout", 60),
    )

    class _DeepSeekDirect(BaseChatModel):
        """Custom ChatModel for DeepSeek — captures reasoning_content."""

        model_name: str = ""
        temperature: float = 0.7
        max_tokens: int = 4096
        _tools: list | None = None

        def __init__(self, **kw):
            super().__init__(model_name=model, temperature=kwargs.get("temperature", 0.7) or 0.7, max_tokens=kwargs.get("max_tokens", 4096) or 4096, **kw)

        def bind_tools(self, tools: list):
            self._tools = tools
            return self

        def _generate(self, messages, stop=None, run_manager=None, **kw) -> ChatResult:
            api_messages = _to_api_messages(messages)
            create_kw = dict(model=self.model_name, messages=api_messages, temperature=self.temperature, max_tokens=self.max_tokens)
            if stop:
                create_kw["stop"] = stop
            if self._tools:
                create_kw["tools"] = [_tool_def(t) for t in self._tools]
            response = client.chat.completions.create(**create_kw)
            choice = response.choices[0]
            msg = choice.message
            ai_kw = {"content": msg.content or ""}
            extra = {}
            rc = getattr(msg, "reasoning_content", None)
            if rc:
                extra["reasoning_content"] = rc
            if extra:
                ai_kw["additional_kwargs"] = extra
            if msg.tool_calls:
                ai_kw["tool_calls"] = [_to_lc_tc(tc) for tc in msg.tool_calls]
            return ChatResult(generations=[ChatGeneration(message=AIMessage(**ai_kw))])

        @property
        def _llm_type(self) -> str:
            return "deepseek"

    return _DeepSeekDirect()


def _to_api_messages(messages: list[BaseMessage]) -> list[dict]:
    result = []
    for m in messages:
        d = {"role": _role(m), "content": m.content or ""}
        if m.type == "ai":
            extra = getattr(m, "additional_kwargs", {}) or {}
            if "reasoning_content" in extra:
                d["reasoning_content"] = extra["reasoning_content"]
            if m.tool_calls:
                d["tool_calls"] = []
                for tc in m.tool_calls:
                    t = tc if isinstance(tc, dict) else tc.__dict__
                    d["tool_calls"].append({
                        "id": t["id"], "type": "function",
                        "function": {"name": t["name"], "arguments": json.dumps(t["args"]) if isinstance(t["args"], dict) else str(t["args"])},
                    })
        elif m.type == "tool":
            d["tool_call_id"] = getattr(m, "tool_call_id", "")
        result.append(d)
    return result


def _tool_def(t) -> dict:
    schema = t.args_schema.schema() if hasattr(t, "args_schema") and t.args_schema else {"type": "object", "properties": {}}
    return {"type": "function", "function": {"name": t.name, "description": t.description or "", "parameters": schema}}


def _to_lc_tc(tc):
    try:
        args = json.loads(tc.function.arguments) if isinstance(tc.function.arguments, str) else tc.function.arguments
    except (json.JSONDecodeError, TypeError):
        args = {}
    return {"id": tc.id, "name": tc.function.name, "args": args, "type": "tool_call"}


def _role(m) -> str:
    t = m.type
    if t in ("human", "user"):
        return "user"
    if t == "ai":
        return "assistant"
    return t
