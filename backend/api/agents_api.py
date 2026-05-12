"""Agent definition API — list, create, delete, and inspect sub-agent definitions."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.subagents import list_agents, get_agent, install_agent, remove_agent, run_subagent

router = APIRouter()


class CreateAgentRequest(BaseModel):
    name: str
    description: str
    tools: list[str] = []
    system_prompt: str = ""
    author: str = "user"
    version: str = "1.0.0"
    model_provider: str = "anthropic"
    model: str = "claude-sonnet-4-20250514"
    temperature: float = 0.7
    max_tokens: int = 4096


class RunAgentRequest(BaseModel):
    task: str
    context: str = ""


@router.get("/api/agents")
async def get_agents():
    """List all sub-agent definitions."""
    return {"agents": list_agents()}


@router.get("/api/agents/{name}")
async def get_agent_detail(name: str):
    """Get a single agent's full definition (including system_prompt)."""
    agent = get_agent(name)
    if agent is None:
        raise HTTPException(404, f"Agent '{name}' not found")
    return agent


@router.post("/api/agents")
async def create_agent(req: CreateAgentRequest):
    """Create a new sub-agent definition."""
    install_agent(
        name=req.name,
        description=req.description,
        tools=req.tools,
        system_prompt=req.system_prompt,
        author=req.author,
        version=req.version,
        model_provider=req.model_provider,
        model=req.model,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
    )
    return {"name": req.name, "description": req.description, "tools": req.tools}


@router.delete("/api/agents/{name}")
async def delete_agent(name: str):
    """Delete a sub-agent definition."""
    if remove_agent(name):
        return {"status": "deleted"}
    raise HTTPException(404, f"Agent '{name}' not found")


@router.post("/api/agents/{name}/run")
async def run_agent_manual(name: str, req: RunAgentRequest):
    """Manually run a sub-agent (for testing / frontend preview)."""
    result, run_id = run_subagent(name, req.task, req.context)
    return {"result": result, "run_id": run_id}
