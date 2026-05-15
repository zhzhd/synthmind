"""Streaming chat endpoint — POST /api/chat/stream (SSE)."""

from __future__ import annotations

import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from core.agent import _build_system_prompt
from core.llm import get_chat_model
from core.state import ModelConfig
from core.tools import get_tools
from core.memory import format_memory_context
from services.threads import get_history, add_messages as save_messages
from services.provider_config import load_configs

router = APIRouter()


@router.post("/api/chat/stream")
async def chat_stream(req: Request):
    """SSE streaming chat endpoint.

    Streams ``reasoning_content`` and ``content`` tokens via Server-Sent Events.
    Final event includes the complete message for history saving.
    """
    body = await req.json()
    message = body.get("message", "")
    thread_id = body.get("thread_id") or ""
    if not thread_id:
        thread_id = uuid.uuid4().hex[:12]
    config_id = body.get("config_id")
    system_prompt = body.get("system_prompt")

    # Resolve model config
    mc_data = body.get("llm_config", {})
    model_config = ModelConfig(
        provider=mc_data.get("provider", "anthropic"),
        model=mc_data.get("model", ""),
        temperature=mc_data.get("temperature", 0.7),
        max_tokens=mc_data.get("max_tokens", 4096),
        api_key=mc_data.get("api_key", ""),
        base_url=mc_data.get("base_url", ""),
    )

    # Match saved config if config_id is provided
    configs = load_configs()
    if config_id:
        matched = next((c for c in configs if c["id"] == config_id), None)
    elif not model_config.api_key:
        matched = next(
            (
                c
                for c in configs
                if c["provider"] == model_config.provider
                and c["model"] == model_config.model
                and c.get("api_key")
            ),
            None,
        )
    else:
        matched = None

    if matched:
        model_config = ModelConfig(
            provider=matched["provider"],
            model=matched["model"],
            api_key=matched["api_key"],
            base_url=matched["base_url"],
            temperature=model_config.temperature,
            max_tokens=model_config.max_tokens,
        )

    async def event_stream() -> AsyncGenerator[str, None]:
        # Build system prompt + memory context
        sp = _build_system_prompt(system_prompt)

        # Load thread history
        history = get_history(thread_id) if thread_id else []
        all_msgs = list(history) if history else []

        # Inject memory context based on user message
        mem_context = format_memory_context(message)
        if mem_context:
            sp += mem_context

        # Build LLM
        llm_kw = dict(
            provider=model_config.provider,
            model=model_config.model,
            temperature=model_config.temperature,
            max_tokens=model_config.max_tokens,
        )
        if model_config.api_key:
            llm_kw["api_key"] = model_config.api_key
        if model_config.base_url:
            llm_kw["base_url"] = model_config.base_url
        llm = get_chat_model(**llm_kw).bind_tools(get_tools())

        # Build message list (same format as call_model in agent.py)
        from langchain_core.messages import (
            AIMessage,
            HumanMessage,
            SystemMessage,
            ToolMessage,
        )

        # Collect tool_call_ids that have matching tool messages (same logic as call_model)
        executed_ids: set = set()
        for m in all_msgs:
            if m.get("role") == "tool" and m.get("tool_call_id"):
                executed_ids.add(m["tool_call_id"])

        msgs = [SystemMessage(content=sp)]
        for m in all_msgs:
            if m["role"] == "user":
                msgs.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant":
                ai_kw: dict = {"content": m.get("content", "")}
                tc = m.get("tool_calls")
                # Only include tool_calls that have a matching tool response
                if tc:
                    tc = [t for t in tc if t.get("id") in executed_ids]
                if tc:
                    ai_kw["tool_calls"] = [
                        {"name": t["name"], "args": t["args"], "id": t["id"]}
                        for t in tc
                    ]
                extra = {}
                for k in ("reasoning_content",):
                    if k in m:
                        extra[k] = m[k]
                if extra:
                    ai_kw["additional_kwargs"] = extra
                msgs.append(AIMessage(**ai_kw))
            elif m["role"] == "tool":
                msgs.append(
                    ToolMessage(content=m["content"], tool_call_id=m["tool_call_id"])
                )

        msgs.append(HumanMessage(content=message))

        # Stream from LLM
        full_content = ""
        full_reasoning = ""
        collected_tool_calls: list[dict] = []

        try:
            # llm.stream() yields AIMessageChunk directly
            for msg_chunk in llm.stream(msgs):
                # Reasoning content (in additional_kwargs)
                rc = msg_chunk.additional_kwargs.get("reasoning_content", "")
                if rc:
                    full_reasoning += rc
                    yield f"event: reasoning\ndata: {json.dumps({'content': rc})}\n\n"

                # Regular content
                if msg_chunk.content:
                    full_content += msg_chunk.content
                    yield f"event: content\ndata: {json.dumps({'content': msg_chunk.content})}\n\n"

                # Tool calls (final accumulated)
                if msg_chunk.tool_calls:
                    collected_tool_calls = list(msg_chunk.tool_calls)

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            return

        # If tool_calls were returned, the streaming endpoint can't execute them.
        # Signal the frontend to fall back to the non-streaming agent flow.
        if collected_tool_calls:
            yield f"event: fallback\ndata: {json.dumps({'reason': 'tool_calls', 'tool_calls': collected_tool_calls, 'thread_id': thread_id})}\n\n"
            return

        # If model only returned reasoning_content with empty content, use reasoning as display content
        display_content = full_content or full_reasoning or ""

        # Save message to thread history
        if thread_id and display_content:
            new_msg = {"role": "assistant", "content": display_content[:500]}
            if full_reasoning:
                new_msg["reasoning_content"] = full_reasoning[:2000]
            save_messages(
                thread_id, [{"role": "user", "content": message[:500]}, new_msg]
            )

        result = {
            "content": display_content,
            "reasoning_content": full_reasoning or None,
            "thread_id": thread_id,
        }
        yield f"event: done\ndata: {json.dumps(result)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
