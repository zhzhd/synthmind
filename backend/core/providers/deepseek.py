"""DeepSeek provider — handles thinking mode + reasoning_content + streaming."""

from __future__ import annotations

import json
from typing import Any, Iterator

import openai
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult


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
        reasoning_effort: str = "high"
        _tools: list | None = None

        def __init__(self, **kw):
            re = kw.pop("reasoning_effort", "high")
            super().__init__(
                model_name=model,
                temperature=kwargs.get("temperature", 0.7) or 0.7,
                max_tokens=kwargs.get("max_tokens", 4096) or 4096,
                reasoning_effort=re,
                **kw,
            )

        def bind_tools(self, tools: list):
            self._tools = tools
            return self

        def _build_create_kw(self, api_messages, stream=False):
            """Build kwargs for the OpenAI API call."""
            kw: dict[str, Any] = dict(
                model=self.model_name,
                messages=api_messages,
            )
            if stream:
                kw["stream"] = True
                kw["stream_options"] = {"include_usage": True}
            # Only pass temp/max_tokens for non-reasoning models
            if self.reasoning_effort and self.reasoning_effort != "high":
                kw["reasoning_effort"] = self.reasoning_effort
            else:
                kw["temperature"] = self.temperature
                kw["max_tokens"] = self.max_tokens
            return kw

        def _generate(self, messages, stop=None, run_manager=None, **kw) -> ChatResult:
            api_messages = _to_api_messages(messages)
            create_kw = self._build_create_kw(api_messages)
            if stop:
                create_kw["stop"] = stop
            if self._tools:
                create_kw["tools"] = [_tool_def(t) for t in self._tools]
                create_kw["tool_choice"] = "auto"
            # Log exact API call (first 3 messages for brevity)
            msg_sample = json.dumps([{k: v for k, v in m.items() if k in ('role', 'content', 'tool_calls')} for m in create_kw.get('messages', [])], ensure_ascii=False)[:300]
            print(f"[DEEPSEEK] _generate: model={create_kw.get('model')} tools={len(create_kw.get('tools', []))} msgs={len(create_kw.get('messages', []))}", flush=True)
            if create_kw.get('tools'):
                print(f"[DEEPSEEK] tool names: {[t['function']['name'] for t in create_kw['tools']]}", flush=True)
            print(f"[DEEPSEEK] first msgs: {msg_sample}...", flush=True)
            # Direct API call
            response = client.chat.completions.create(**create_kw)
            first_msg = response.choices[0].message
            print(f"[DEEPSEEK] response: tool_calls={bool(first_msg.tool_calls)} content={str(first_msg.content)[:80]}", flush=True)
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
            # Capture token usage
            usage = getattr(response, "usage", None)
            llm_output = {}
            if usage:
                tok = {
                    "prompt_tokens": usage.prompt_tokens or 0,
                    "completion_tokens": usage.completion_tokens or 0,
                    "total_tokens": usage.total_tokens or 0,
                }
                # completion_tokens_details may be a non-serializable object
                ctd = getattr(usage, "completion_tokens_details", None)
                if ctd:
                    tok["completion_tokens_details"] = {
                        k: v for k, v in ctd.__dict__.items() if v is not None
                    } if hasattr(ctd, "__dict__") else str(ctd)
                llm_output["token_usage"] = tok
            return ChatResult(
                generations=[ChatGeneration(message=AIMessage(**ai_kw))],
                llm_output=llm_output or None,
            )

        def _stream(
            self,
            messages: list[BaseMessage],
            stop: list[str] | None = None,
            run_manager: CallbackManagerForLLMRun | None = None,
            **kwargs: Any,
        ) -> Iterator[ChatGenerationChunk]:
            api_messages = _to_api_messages(messages)
            create_kw = self._build_create_kw(api_messages, stream=True)
            if stop:
                create_kw["stop"] = stop
            if self._tools:
                create_kw["tools"] = [_tool_def(t) for t in self._tools]

            response = client.chat.completions.create(**create_kw)
            # Accumulate tool call deltas across chunks
            tc_deltas: dict[int, dict] = {}

            for chunk in response:
                # Capture token usage from the final chunk (no choices)
                if not chunk.choices:
                    if chunk.usage:
                        # Yield one final chunk with usage metadata
                        usage_meta = {
                            "input_tokens": chunk.usage.prompt_tokens or 0,
                            "output_tokens": chunk.usage.completion_tokens or 0,
                            "total_tokens": chunk.usage.total_tokens or 0,
                        }
                        yield ChatGenerationChunk(
                            message=AIMessageChunk(
                                content="",
                                usage_metadata=usage_meta,
                            )
                        )
                    continue
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta is None:
                    continue

                # ── Reasoning content ──
                rc = getattr(delta, "reasoning_content", None)
                if rc:
                    chunk_kw: dict[str, Any] = {
                        "content": "",
                        "additional_kwargs": {"reasoning_content": rc},
                    }
                    yield ChatGenerationChunk(message=AIMessageChunk(**chunk_kw))

                # ── Regular text content ──
                if delta.content:
                    yield ChatGenerationChunk(
                        message=AIMessageChunk(content=delta.content)
                    )

                # ── Tool calls ──
                if delta.tool_calls:
                    for tc_chunk in delta.tool_calls:
                        idx = tc_chunk.index
                        if idx not in tc_deltas:
                            tc_deltas[idx] = {
                                "id": tc_chunk.id or "",
                                "name": tc_chunk.function.name or "",
                                "args": "",
                            }
                        tc_data = tc_deltas[idx]
                        if tc_chunk.id:
                            tc_data["id"] = tc_chunk.id
                        if tc_chunk.function:
                            if tc_chunk.function.name:
                                tc_data["name"] = tc_chunk.function.name
                            if tc_chunk.function.arguments:
                                tc_data["args"] += tc_chunk.function.arguments

                # ── Finish reason — emit accumulated tool calls ──
                finish = chunk.choices[0].finish_reason
                if finish and tc_deltas:
                    final_tcs = []
                    for idx in sorted(tc_deltas.keys()):
                        td = tc_deltas[idx]
                        try:
                            parsed_args = json.loads(td["args"]) if td["args"] else {}
                        except json.JSONDecodeError:
                            parsed_args = {}
                        final_tcs.append({
                            "id": td["id"],
                            "name": td["name"],
                            "args": parsed_args,
                            "type": "tool_call",
                        })
                    if final_tcs:
                        yield ChatGenerationChunk(
                            message=AIMessageChunk(
                                content="", tool_calls=final_tcs
                            )
                        )

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
            # DeepSeek requires reasoning_content to be passed back
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
