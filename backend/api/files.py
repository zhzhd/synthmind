"""Files API — list directory contents, read/write file contents."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()


class WriteFileRequest(BaseModel):
    path: str
    content: str


class FIMCompleteRequest(BaseModel):
    content: str
    cursor_line: int = 0
    cursor_column: int = 0
    max_tokens: int = 256


@router.get("/api/files")
async def list_files(path: str = Query(default=".")):
    """List files and directories at the given path."""
    try:
        p = Path(path).resolve()
        if not p.exists():
            raise HTTPException(404, f"Path not found: {path}")
        if not p.is_dir():
            raise HTTPException(400, f"Not a directory: {path}")

        entries = []
        for entry in sorted(p.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            stat = entry.stat()
            entries.append({
                "name": entry.name,
                "path": str(entry.resolve()),
                "is_dir": entry.is_dir(),
                "size": stat.st_size if entry.is_file() else 0,
                "modified": int(stat.st_mtime),
            })

        return {"entries": entries, "path": str(p)}
    except PermissionError:
        raise HTTPException(403, f"Permission denied: {path}")
    except OSError as e:
        raise HTTPException(500, str(e))


@router.get("/api/files/content")
async def read_file(path: str = Query(...)):
    """Read the content of a file."""
    try:
        p = Path(path).resolve()
        if not p.exists():
            raise HTTPException(404, f"File not found: {path}")
        if not p.is_file():
            raise HTTPException(400, f"Not a file: {path}")

        # Limit file size to 1MB
        max_size = 1024 * 1024
        if p.stat().st_size > max_size:
            return {"content": f"[File too large: {p.stat().st_size} bytes]"}

        try:
            content = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, LookupError):
            return {"content": "[Binary file]"}

        return {"content": content, "path": str(p), "size": p.stat().st_size}
    except PermissionError:
        raise HTTPException(403, f"Permission denied: {path}")
    except OSError as e:
        raise HTTPException(500, str(e))


@router.put("/api/files/content")
async def write_file(req: WriteFileRequest):
    """Write content to a file."""
    try:
        p = Path(req.path).resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(req.content, encoding="utf-8")
        return {"ok": True, "path": str(p)}
    except PermissionError:
        raise HTTPException(403, f"Permission denied: {req.path}")
    except OSError as e:
        raise HTTPException(500, str(e))


@router.post("/api/files/fim-complete")
async def fim_complete(req: FIMCompleteRequest):
    """Generate code completion using DeepSeek FIM (Fill-in-the-Middle) API.

    Splits file content at the cursor position into prompt (before cursor)
    and suffix (after cursor), then asks DeepSeek to fill the middle.
    """
    lines = req.content.split("\n")

    # ── Split content at cursor into prompt + suffix ────────
    if req.cursor_line < len(lines):
        before_cursor = "\n".join(
            lines[:req.cursor_line] + [lines[req.cursor_line][:req.cursor_column]]
        )
        after_cursor = "\n".join(
            [lines[req.cursor_line][req.cursor_column:]] + lines[req.cursor_line + 1:]
        )
    else:
        before_cursor = req.content
        after_cursor = ""

    # ── Resolve DeepSeek API key ────────────────────────────
    api_key = ""
    from services.provider_config import load_configs as load_providers
    for cfg in load_providers():
        if cfg.get("provider") == "deepseek" and cfg.get("api_key"):
            api_key = cfg["api_key"]
            break
    if not api_key:
        api_key = os.getenv("DEEPSEEK_API_KEY", "")
    if not api_key:
        raise HTTPException(400, "No DeepSeek API key configured. Add one in Settings → Providers.")

    # ── Call DeepSeek FIM API ───────────────────────────────
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com/beta")
        response = client.completions.create(
            model="deepseek-chat",
            prompt=before_cursor,
            suffix=after_cursor,
            max_tokens=req.max_tokens,
            temperature=0,
            stop=["\n\n\n", "\r\n\r\n\r\n"],
        )
        completion = response.choices[0].text if response.choices else ""
        return {"completion": completion}
    except Exception as e:
        raise HTTPException(502, f"FIM API error: {e}")
