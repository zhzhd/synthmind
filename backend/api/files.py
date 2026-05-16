"""Files API — list directory contents and read file contents."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()


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
