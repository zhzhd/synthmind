"""Skill management endpoints."""

from fastapi import APIRouter, HTTPException

from services.skills import list_skills, get_skill, install_skill, remove_skill, set_skill_active, install_from_hub

router = APIRouter()


@router.get("/api/skills")
async def list_all():
    return {"skills": list_skills()}


@router.get("/api/skills/{name}")
async def detail(name: str):
    s = get_skill(name)
    if not s:
        raise HTTPException(404, f"Skill '{name}' not found")
    return s


@router.post("/api/skills")
async def create(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Skill name required")
    try:
        return install_skill(name=name, description=body.get("description", ""), instructions=body.get("instructions", ""), author=body.get("author", "user"), version=body.get("version", "1.0.0"))
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/api/skills/{name}")
async def delete(name: str):
    if not remove_skill(name):
        raise HTTPException(404, f"Skill '{name}' not found")
    return {"ok": True}


@router.put("/api/skills/{name}/toggle")
async def toggle(name: str, body: dict):
    if not set_skill_active(name, body.get("active", True)):
        raise HTTPException(404, f"Skill '{name}' not found")
    return {"ok": True}


@router.post("/api/skills/install-url")
async def install_url(body: dict):
    url = body.get("url", "").strip()
    if not url:
        raise HTTPException(400, "URL required")
    try:
        return install_from_hub(url)
    except Exception as e:
        raise HTTPException(500, str(e))
