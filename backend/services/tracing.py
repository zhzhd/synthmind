"""LangChain callback-based tracing — records LLM + tool traces to .config/logs/traces.json.

Usage:
    tracer = SynthMindTracer(thread_id="abc123")
    config = {"configurable": {...}, "callbacks": [tracer]}
    state = await agent.ainvoke(state, config)

The tracer hooks into LangChain's lifecycle events (on_chat_model_start,
on_llm_end, on_tool_start, on_tool_end, on_llm_error, on_tool_error) and
persists structured traces immediately to disk.
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult

_TRACES_FILE = Path(__file__).resolve().parent.parent / ".config" / "logs" / "traces.json"
_TRACES_FILE.parent.mkdir(parents=True, exist_ok=True)
_MAX_TRACES = 5000


# ── Persistence ─────────────────────────────────────────────────────────

def _load_traces() -> list[dict]:
    if _TRACES_FILE.exists():
        try:
            return json.loads(_TRACES_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save_traces(data: list[dict]) -> None:
    _TRACES_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def _append_trace(entry: dict) -> None:
    traces = _load_traces()
    traces.append(entry)
    if len(traces) > _MAX_TRACES:
        traces = traces[-_MAX_TRACES:]
    _save_traces(traces)


def list_traces(thread_id: str | None = None) -> list[dict]:
    """Return all traces, newest first.  Optionally filter by thread_id."""
    traces = _load_traces()
    if thread_id:
        traces = [t for t in traces if t.get("thread_id") == thread_id]
    return sorted(traces, key=lambda t: t.get("timestamp", 0), reverse=True)


def clear_traces() -> None:
    """Delete all traces."""
    if _TRACES_FILE.exists():
        _TRACES_FILE.unlink()


# ── Tracer callback handler ──────────────────────────────────────────────

class SynthMindTracer(BaseCallbackHandler):
    """Custom LangChain callback handler that records LLM + tool traces."""

    def __init__(self, thread_id: str = ""):
        super().__init__()
        self._thread_id = thread_id
        self._start_times: dict[str, float] = {}       # run_id → timestamp
        self._model_info: dict[str, dict] = {}          # run_id → {model, input_preview}

    # ── LLM callbacks ─────────────────────────────────────────────────

    def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list],
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> Any:
        rid = str(run_id)
        self._start_times[rid] = time.time()
        model_name = (
            (kwargs.get("metadata") or {}).get("model", "")
            or serialized.get("name", "")
        )
        # Extract a preview from the last user message in the list
        input_preview = ""
        for msg_list in messages:
            for msg in msg_list:
                raw = getattr(msg, "content", str(msg))[:500]
                if raw:
                    input_preview = raw
                    break
            if input_preview:
                break
        self._model_info[rid] = {"model": model_name, "input_preview": input_preview}

    def on_llm_end(self, response: LLMResult, *, run_id: uuid.UUID, **kwargs: Any) -> Any:
        rid = str(run_id)
        start = self._start_times.pop(rid, None)
        info = self._model_info.pop(rid, {})
        latency_ms = int((time.time() - start) * 1000) if start else 0

        # Extract output text
        output_preview = ""
        if response.generations:
            for gen_list in response.generations:
                for gen in gen_list:
                    text = gen.text or ""
                    if not text and hasattr(gen, "message"):
                        text = getattr(gen.message, "content", "") or ""
                    if text:
                        output_preview = text[:1000]
                        break
                if output_preview:
                    break

        # Extract token usage
        token_usage: dict = {}
        if response.llm_output and isinstance(response.llm_output, dict):
            token_usage = response.llm_output.get("token_usage", token_usage)
            # Some providers nest under usage or token_usage
            if not token_usage:
                token_usage = response.llm_output.get("usage", {})

        _append_trace({
            "id": rid[:12],
            "thread_id": self._thread_id,
            "type": "llm",
            "model": info.get("model", ""),
            "name": info.get("model", ""),
            "input_preview": info.get("input_preview", ""),
            "output_preview": output_preview,
            "token_usage": token_usage,
            "latency_ms": latency_ms,
            "timestamp": start or time.time(),
            "error": None,
        })

    def on_llm_error(self, error: Exception, *, run_id: uuid.UUID, **kwargs: Any) -> Any:
        rid = str(run_id)
        start = self._start_times.pop(rid, None)
        info = self._model_info.pop(rid, {})
        latency_ms = int((time.time() - start) * 1000) if start else 0
        _append_trace({
            "id": rid[:12],
            "thread_id": self._thread_id,
            "type": "error",
            "model": info.get("model", ""),
            "name": info.get("model", ""),
            "input_preview": info.get("input_preview", ""),
            "output_preview": "",
            "token_usage": {},
            "latency_ms": latency_ms,
            "timestamp": start or time.time(),
            "error": f"{type(error).__name__}: {error}",
        })

    # Note: tool traces are recorded directly by execute_tools(),
    # resume_with_approval(), and resume_with_multiple_approvals().
    # Tool callbacks (on_tool_start/on_tool_end/on_tool_error) are
    # intentionally omitted because LangGraph's callback propagation
    # is unreliable across node boundaries. Use _record_tool_trace()
    # for all tool trace recording.
