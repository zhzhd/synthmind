"""Filesystem tools — ls, read, write, edit, glob, grep."""

import glob as glob_module
import os
import re
from pathlib import Path

from langchain_core.tools import tool


@tool
def ls(path: str = ".") -> str:
    """List files and directories at the given path.

    Args:
        path: Directory path (default: current directory).

    Returns:
        Formatted directory listing.
    """
    try:
        entries = sorted(Path(path).iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        lines = [f"📁 {e.name}/" if e.is_dir() else f"📄 {e.name}" for e in entries]
        total = len(entries)
        lines.append(f"\n{total} entries")
        return "\n".join(lines)
    except FileNotFoundError:
        return f"❌ Directory not found: {path}"
    except NotADirectoryError:
        return f"❌ Not a directory: {path}"
    except PermissionError:
        return f"❌ Permission denied: {path}"
    except Exception as e:
        return f"❌ Error: {e}"


@tool
def read_file(path: str, offset: int = 0, limit: int = 0) -> str:
    """Read the contents of a text file.

    Supports optional pagination via ``offset`` (line number) and
    ``limit`` (max lines) to avoid reading very large files entirely.

    Args:
        path: Absolute path to the file.
        offset: Starting line number (0-based, default 0).
        limit: Max lines to return (0 = all).

    Returns:
        File contents.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        total = len(lines)
        if offset > 0 or limit > 0:
            start = offset
            end = offset + limit if limit > 0 else total
            lines = lines[start:end]

        content = "".join(lines)
        header = f"📄 {path} ({total} lines"
        if offset > 0 or limit > 0:
            header += f", showing {start}-{min(end, total)}"
        header += ")\n"

        return header + content
    except FileNotFoundError:
        return f"❌ File not found: {path}"
    except IsADirectoryError:
        return f"❌ Is a directory: {path}"
    except Exception as e:
        return f"❌ Error: {e}"


@tool
def write_file(path: str, content: str) -> str:
    """Create a new file or overwrite an existing file.

    Creates parent directories automatically if they don't exist.

    Args:
        path: Absolute path to the file.
        content: Text content to write.

    Returns:
        Confirmation message.
    """
    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"✅ Written {len(content)} bytes to {path}"
    except Exception as e:
        return f"❌ Error writing file: {e}"


@tool
def edit_file(path: str, old_string: str, new_string: str) -> str:
    """Edit a file by replacing an exact string match.

    This is a search-and-replace operation.  The ``old_string`` must
    match exactly (including whitespace) and occur **exactly once** in
    the file.  Use ``grep`` to find the exact string first.

    Args:
        path: Absolute path to the file.
        old_string: Text to search for (must match exactly).
        new_string: Replacement text.

    Returns:
        Confirmation message.
    """
    try:
        p = Path(path)
        content = p.read_text(encoding="utf-8")
        count = content.count(old_string)

        if count == 0:
            return f"❌ String not found in {path}"
        if count > 1:
            return f"❌ String found {count} times in {path}. Edit requires exactly 1 match. Use grep to locate the exact string."

        new_content = content.replace(old_string, new_string)
        p.write_text(new_content, encoding="utf-8")
        return f"✅ Edited {path}: replaced 1 occurrence"
    except FileNotFoundError:
        return f"❌ File not found: {path}"
    except Exception as e:
        return f"❌ Error: {e}"


@tool
def glob(pattern: str) -> str:
    """Find files matching a glob pattern.

    Supports ``**`` for recursive matching (e.g., ``**/*.py``).

    Args:
        pattern: Glob pattern (e.g. ``src/**/*.ts``, ``*.txt``).

    Returns:
        Matching file paths.
    """
    try:
        matches = sorted(glob_module.glob(pattern, recursive=True))
        if not matches:
            return f"No files match: {pattern}"
        lines = [f"🔍 {pattern}\n"]
        for m in matches:
            lines.append(f"  {m}")
        lines.append(f"\n{len(matches)} matches")
        return "\n".join(lines)
    except Exception as e:
        return f"❌ Error: {e}"


@tool
def grep(pattern: str, path: str = ".", include: str = "") -> str:
    """Search for a pattern in files.

    Args:
        pattern: Regex pattern to search for.
        path: Directory or file to search in (default: current dir).
        include: Glob pattern to filter files (e.g. ``*.py``, ``*.md``).

    Returns:
        Matching lines with file paths and line numbers.
    """
    try:
        root = Path(path)
        if root.is_file():
            files = [root]
        elif root.is_dir():
            if include:
                files = sorted(root.rglob(include))
            else:
                files = sorted(root.rglob("*"))
                files = [f for f in files if f.is_file()]
        else:
            return f"❌ Path not found: {path}"

        results = []
        for filepath in files:
            if not filepath.is_file():
                continue
            try:
                for i, line in enumerate(filepath.read_text(encoding="utf-8").splitlines(), 1):
                    if re.search(pattern, line):
                        results.append(f"{filepath}:{i}: {line[:200]}")
            except (UnicodeDecodeError, OSError):
                continue

        if not results:
            return f"No matches for {pattern!r} in {path}"
        lines = [f"🔍 {pattern!r} in {path}\n"]
        lines.extend(results[:50])
        if len(results) > 50:
            lines.append(f"\n... and {len(results) - 50} more matches")
        else:
            lines.append(f"\n{len(results)} matches")
        return "\n".join(lines)
    except Exception as e:
        return f"❌ Error: {e}"
