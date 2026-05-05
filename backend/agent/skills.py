"""Skill manager for SynthMind.

Skills are directories containing a SKILL.md file with YAML frontmatter
and Markdown instructions.  The agent loads active skills into its
context to extend its capabilities.

Skill directory structure::

    backend/.skills/
    ├── web-research/
    │   ├── SKILL.md          # required: name, desc, instructions
    │   ├── requirements.txt  # optional: extra pip deps
    │   └── ...               # optional: reference files, templates
    └── ...
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

# ── Paths ──────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
SKILLS_DIR = BASE_DIR / ".skills"
SKILLS_INDEX = BASE_DIR / ".config" / "skills_index.json"

SKILLS_DIR.mkdir(parents=True, exist_ok=True)
BASE_DIR.joinpath(".config").mkdir(parents=True, exist_ok=True)

# ── Data model ─────────────────────────────────────────────────────

SKILL_FRONTMATTER_RE = re.compile(
    r"^---\s*\n(.*?)\n---\s*\n?(.*)", re.DOTALL
)


def parse_skill_md(content: str) -> tuple[dict[str, Any], str]:
    """Parse YAML frontmatter + body from a SKILL.md file.

    Returns (frontmatter_dict, body_markdown).
    """
    match = SKILL_FRONTMATTER_RE.match(content)
    if not match:
        return {}, content

    raw = match.group(1)
    body = match.group(2).strip()

    # Simple YAML-like parser (no PyYAML dependency needed)
    meta: dict[str, Any] = {}
    for line in raw.strip().splitlines():
        line = line.strip()
        if ":" in line:
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            meta[key] = val

    return meta, body


def make_skill_md(name: str, description: str, instructions: str) -> str:
    """Generate a SKILL.md string."""
    return (
        "---\n"
        f"name: {name}\n"
        f"description: {description}\n"
        "---\n\n"
        f"{instructions}\n"
    )


# ── Skill loading ─────────────────────────────────────────────────

def list_skills() -> list[dict[str, Any]]:
    """Scan the skills directory and return metadata for each skill."""
    skills: list[dict[str, Any]] = []
    seen = _load_index()

    for entry in sorted(SKILLS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        skill_md = entry / "SKILL.md"
        if not skill_md.exists():
            continue

        meta, _ = parse_skill_md(skill_md.read_text())
        name = meta.get("name", entry.name)
        active = seen.get(name, {}).get("active", True)

        skills.append({
            "name": name,
            "description": meta.get("description", ""),
            "version": meta.get("version", "1.0.0"),
            "author": meta.get("author", "unknown"),
            "active": active,
            "path": str(entry),
        })

    return skills


def get_skill(name: str) -> dict[str, Any] | None:
    """Return full skill detail (metadata + instructions)."""
    skill_dir = SKILLS_DIR / name
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        return None

    meta, instructions = parse_skill_md(skill_md.read_text())
    return {
        "name": meta.get("name", name),
        "description": meta.get("description", ""),
        "version": meta.get("version", "1.0.0"),
        "author": meta.get("author", "unknown"),
        "active": True,
        "instructions": instructions,
        "path": str(skill_dir),
    }


def get_active_skills_instructions() -> str:
    """Return the concatenated instructions of all active skills.

    This is injected into the agent's system prompt.
    """
    parts: list[str] = []

    for skill in list_skills():
        if not skill["active"]:
            continue
        detail = get_skill(skill["name"])
        if detail and detail.get("instructions"):
            parts.append(
                f"## Skill: {detail['name']}\n"
                f"{detail['description']}\n\n"
                f"{detail['instructions']}\n"
            )

    if not parts:
        return ""

    return (
        "\n\n---\n"
        "## Available Skills\n"
        "You have the following skills loaded. Use them when relevant.\n\n"
        + "\n---\n".join(parts)
    )


# ── Install / Remove ──────────────────────────────────────────────

def install_skill(
    name: str,
    description: str,
    instructions: str,
    author: str = "user",
    version: str = "1.0.0",
    files: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Create a new skill from metadata + instructions.

    Args:
        name: Unique skill name (used as directory name).
        description: One-line description.
        instructions: Markdown instructions for the agent.
        author: Skill author.
        version: Semantic version.
        files: Optional dict of ``{relative_path: content}`` for extra files.

    Returns:
        The skill metadata dict.
    """
    skill_dir = SKILLS_DIR / name
    skill_dir.mkdir(parents=True, exist_ok=True)

    skill_md = make_skill_md(name, description, instructions)
    (skill_dir / "SKILL.md").write_text(skill_md)

    if files:
        for rel_path, content in files.items():
            target = skill_dir / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)

    _update_index(name, active=True)

    return {
        "name": name,
        "description": description,
        "version": version,
        "author": author,
        "active": True,
    }


def remove_skill(name: str) -> bool:
    """Remove a skill directory."""
    skill_dir = SKILLS_DIR / name
    if not skill_dir.exists():
        return False
    shutil.rmtree(skill_dir)
    _remove_from_index(name)
    return True


def set_skill_active(name: str, active: bool) -> bool:
    """Enable or disable a skill without deleting it."""
    skill_dir = SKILLS_DIR / name
    if not skill_dir.exists() or not (skill_dir / "SKILL.md").exists():
        return False
    _update_index(name, active=active)
    return True


def install_from_hub(url: str) -> dict[str, Any]:
    """Install a skill from a remote URL (SkillHub / GitHub).

    Expects the URL to point to a SKILL.md file or a zip of a skill dir.
    """
    import httpx

    # Try downloading SKILL.md directly
    try:
        resp = httpx.get(url, timeout=15, follow_redirects=True)
        resp.raise_for_status()
    except Exception as e:
        raise RuntimeError(f"Failed to download skill from {url}: {e}")

    content = resp.text
    meta, instructions = parse_skill_md(content)
    name = meta.get("name") or _derive_name_from_url(url)

    if not instructions:
        raise RuntimeError(
            f"No instructions found in skill at {url}. "
            "Expected a SKILL.md file with frontmatter."
        )

    return install_skill(
        name=name,
        description=meta.get("description", f"Skill from {url}"),
        instructions=instructions,
        author=meta.get("author", "remote"),
        version=meta.get("version", "1.0.0"),
    )


# ── Index helpers (persist active/inactive state) ──────────────────

def _load_index() -> dict[str, dict]:
    if SKILLS_INDEX.exists():
        try:
            return json.loads(SKILLS_INDEX.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_index(index: dict) -> None:
    SKILLS_INDEX.write_text(json.dumps(index, indent=2, ensure_ascii=False))


def _update_index(name: str, active: bool) -> None:
    idx = _load_index()
    idx[name] = {"active": active}
    _save_index(idx)


def _remove_from_index(name: str) -> None:
    idx = _load_index()
    idx.pop(name, None)
    _save_index(idx)


def _derive_name_from_url(url: str) -> str:
    import re
    m = re.search(r"/([^/]+?)(\.md)?$", url)
    return m.group(1) if m else f"skill-{uuid.uuid4().hex[:6]}"
