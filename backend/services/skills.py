"""Skill manager — loads skills from .skills/, tracks state in .config/skills_index.json."""

from __future__ import annotations

import json
import re
import shutil
import uuid
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
SKILLS_DIR = BASE_DIR / ".skills"
SKILLS_INDEX = BASE_DIR / ".config" / "skills_index.json"
SKILLS_DIR.mkdir(parents=True, exist_ok=True)
BASE_DIR.joinpath(".config").mkdir(parents=True, exist_ok=True)

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)", re.DOTALL)


def _parse_md(content: str) -> tuple[dict, str]:
    m = FRONTMATTER_RE.match(content)
    if not m:
        return {}, content
    meta = {}
    for line in m.group(1).strip().splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta, m.group(2).strip()


def _make_md(name: str, desc: str, instructions: str) -> str:
    return f"---\nname: {name}\ndescription: {desc}\n---\n\n{instructions}\n"


def list_skills() -> list[dict]:
    seen = _load_index()
    skills = []
    for entry in sorted(SKILLS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        sm = entry / "SKILL.md"
        if not sm.exists():
            continue
        meta, _ = _parse_md(sm.read_text())
        name = meta.get("name", entry.name)
        active = seen.get(name, {}).get("active", True)
        skills.append({"name": name, "description": meta.get("description", ""), "version": meta.get("version", "1.0.0"), "author": meta.get("author", "unknown"), "active": active, "path": str(entry)})
    return skills


def get_skill(name: str) -> dict | None:
    sd = SKILLS_DIR / name
    sm = sd / "SKILL.md"
    if not sm.exists():
        return None
    meta, instructions = _parse_md(sm.read_text())
    return {"name": meta.get("name", name), "description": meta.get("description", ""), "version": meta.get("version", "1.0.0"), "author": meta.get("author", "unknown"), "active": True, "instructions": instructions, "path": str(sd)}


def get_active_skills_instructions() -> str:
    parts = []
    for s in list_skills():
        if not s["active"]:
            continue
        d = get_skill(s["name"])
        if d and d.get("instructions"):
            parts.append(f"## Skill: {d['name']}\n{d['description']}\n\n{d['instructions']}\n")
    if not parts:
        return ""
    return "\n\n---\n## Available Skills\n\n" + "\n---\n".join(parts)


def install_skill(name: str, description: str, instructions: str, author: str = "user", version: str = "1.0.0", files: dict | None = None) -> dict:
    d = SKILLS_DIR / name
    d.mkdir(parents=True, exist_ok=True)
    (d / "SKILL.md").write_text(_make_md(name, description, instructions))
    if files:
        for rp, c in files.items():
            t = d / rp
            t.parent.mkdir(parents=True, exist_ok=True)
            t.write_text(c)
    _update_index(name, True)
    return {"name": name, "description": description, "version": version, "author": author, "active": True}


def remove_skill(name: str) -> bool:
    d = SKILLS_DIR / name
    if not d.exists():
        return False
    shutil.rmtree(d)
    _remove_from_index(name)
    return True


def set_skill_active(name: str, active: bool) -> bool:
    if not (SKILLS_DIR / name / "SKILL.md").exists():
        return False
    _update_index(name, active)
    return True


def install_from_hub(url: str) -> dict:
    import httpx
    try:
        r = httpx.get(url, timeout=15, follow_redirects=True)
        r.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"Failed to download: {e}")
    meta, instructions = _parse_md(r.text)
    name = meta.get("name") or _derive_name(url)
    if not instructions:
        raise RuntimeError("No instructions found in SKILL.md")
    return install_skill(name=name, description=meta.get("description", f"From {url}"), instructions=instructions, author=meta.get("author", "remote"), version=meta.get("version", "1.0.0"))


def _load_index() -> dict:
    if SKILLS_INDEX.exists():
        try:
            return json.loads(SKILLS_INDEX.read_text())
        except Exception:
            return {}
    return {}


def _save_index(idx: dict) -> None:
    SKILLS_INDEX.write_text(json.dumps(idx, indent=2, ensure_ascii=False))


def _update_index(name: str, active: bool) -> None:
    i = _load_index()
    i[name] = {"active": active}
    _save_index(i)


def _remove_from_index(name: str) -> None:
    i = _load_index()
    i.pop(name, None)
    _save_index(i)


def _derive_name(url: str) -> str:
    m = re.search(r"/([^/]+?)(\.md)?$", url)
    return m.group(1) if m else f"skill-{uuid.uuid4().hex[:6]}"
