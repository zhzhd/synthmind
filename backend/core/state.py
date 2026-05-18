"""Pydantic schemas and LangGraph state definition."""

from __future__ import annotations

import operator
from typing import Any, Sequence

from pydantic import BaseModel, Field
from typing_extensions import Annotated, TypedDict


# ── REST API schemas ──────────────────────────────────────────────

class ModelConfig(BaseModel):
    """Configuration for an LLM provider and model."""
    provider: str = Field(default="deepseek")
    model: str = Field(default="deepseek-v4-flash")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=4096, ge=1, le=128000)
    api_key: str = Field(default="")
    base_url: str = Field(default="")
    reasoning_effort: str = Field(default="high")


class ChatRequest(BaseModel):
    message: str
    llm_config: ModelConfig = Field(default_factory=ModelConfig)
    config_id: str | None = Field(default=None)
    thread_id: str | None = None
    system_prompt: str | None = None


class ChatResponse(BaseModel):
    message: str
    thread_id: str
    reasoning_content: str | None = None
    token_usage: dict | None = None


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
    whitelist: bool = False


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


# ── Git request/response schemas ─────────────────────────────────

class GitStageRequest(BaseModel):
    path: str
    files: list[str] = []


class GitCommitRequest(BaseModel):
    path: str
    message: str
    author: str = ""


class GitDiscardRequest(BaseModel):
    path: str
    files: list[str]


class GitRemoteOpRequest(BaseModel):
    path: str
    remote: str = ""
    branch: str = ""
    rebase: bool = False


class GitMergeRequest(BaseModel):
    path: str
    branch: str


class GitStashRequest(BaseModel):
    path: str
    action: str = "push"  # push | pop | list | drop | apply
    message: str = ""
    index: int = 0


class GitCreateBranchRequest(BaseModel):
    path: str
    name: str
    start_point: str = ""
    switch: bool = True


class GitBranchListRequest(BaseModel):
    path: str


class GitCheckoutRequest(BaseModel):
    path: str
    branch: str
    create: bool = False


class GitCommandResult(BaseModel):
    command: str
    stdout: str
    stderr: str
    returncode: int


class GitCherryPickRequest(BaseModel):
    path: str
    commits: list[str]
    no_commit: bool = False


class GitRevertRequest(BaseModel):
    path: str
    commit: str
    no_commit: bool = False


class GitCreateTagRequest(BaseModel):
    path: str
    name: str
    message: str = ""
    commit: str = ""


class GitDeleteTagRequest(BaseModel):
    path: str
    name: str


class GitRebaseRequest(BaseModel):
    path: str
    onto: str
    branch: str = ""


class GitStashListRequest(BaseModel):
    path: str


# ── Phase 3: Conflict schemas ────────────────────────────────────────

class ConflictSegment(BaseModel):
    """One segment of a conflicted file with merge markers."""
    type: str = "context"  # "ours", "base", "theirs", "context"
    content: str = ""


class ConflictFile(BaseModel):
    """A single conflicted file with its merge conflict regions."""
    file: str = ""
    segments: list[ConflictSegment] = Field(default_factory=list)
    raw_diff: str = ""


class ConflictDetectResponse(BaseModel):
    conflicted: list[ConflictFile] = Field(default_factory=list)
    count: int = 0


class ConflictResolveRequest(BaseModel):
    path: str
    file: str = ""
    strategy: str = "ours"  # "ours", "theirs", "manual"
    content: str = ""


# ── Phase 4: Rebase schemas ──────────────────────────────────────────

class RebasePlanRequest(BaseModel):
    path: str
    branch: str = ""
    onto: str = ""


class RebasePlanAction(BaseModel):
    """One action in the rebase todo list."""
    action: str = "pick"  # pick, reword, edit, squash, fixup, drop
    commit_hash: str = ""
    message: str = ""


class RebaseInteractiveRequest(BaseModel):
    path: str
    onto: str
    actions: list[RebasePlanAction] = Field(default_factory=list)


class RebaseContinueRequest(BaseModel):
    path: str


class RebaseAbortRequest(BaseModel):
    path: str


class RebaseSkipRequest(BaseModel):
    path: str


class RebaseStatusRequest(BaseModel):
    path: str


class GitMergeSafeRequest(BaseModel):
    """Merge with auto-stash if working tree is dirty."""
    path: str
    branch: str
    stash_on_dirty: bool = True


class GitCloneRequest(BaseModel):
    """Clone a remote repository."""
    url: str
    target_dir: str = ""
    branch: str = ""
