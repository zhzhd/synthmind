"""Pydantic schemas and LangGraph state definition."""

from __future__ import annotations

import operator
from typing import Any, Sequence

from pydantic import BaseModel, Field
from typing_extensions import Annotated, TypedDict


# ── REST API schemas ──────────────────────────────────────────────

class ModelConfig(BaseModel):
    """Configuration for an LLM provider and model."""
    provider: str = Field(default="anthropic")
    model: str = Field(default="claude-sonnet-4-20250514")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=4096, ge=1, le=128000)
    api_key: str = Field(default="")
    base_url: str = Field(default="")


class ChatRequest(BaseModel):
    message: str
    llm_config: ModelConfig = Field(default_factory=ModelConfig)
    config_id: str | None = Field(default=None)
    thread_id: str | None = None
    system_prompt: str | None = None


class ChatResponse(BaseModel):
    message: str
    thread_id: str


class ModelInfo(BaseModel):
    provider: str
    model: str
    available: bool


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


# ── Provider config schemas ────────────────────────────────────────

class ProviderConfigSchema(BaseModel):
    id: str = ""
    name: str = ""
    provider: str = "openai"
    model: str = ""
    api_key: str = ""
    base_url: str = ""


class ConfigListResponse(BaseModel):
    configs: list[ProviderConfigSchema]


# ── HITL / Approval schemas ────────────────────────────────────────

class PendingApprovalInfo(BaseModel):
    pending_id: str
    tool_name: str
    tool_args: dict[str, Any]
    tool_call_id: str
    explanation: str = ""


class ApprovalRequest(BaseModel):
    pending_id: str
    decision: str = "approve"
    edited_args: dict[str, Any] | None = None


# ── LangGraph state ────────────────────────────────────────────────

class AgentState(TypedDict):
    """State passed between LangGraph nodes."""
    messages: Annotated[Sequence[dict], operator.add]
    next: str
    tool_calls: list[dict]
    tool_outputs: list[str | dict]
    pending_approvals: list[dict]


# ── Tool call tracking ─────────────────────────────────────────────

class ToolCallInfo(BaseModel):
    name: str
    args: dict[str, Any]
    output: str | None = None
