"""Git service — pure git operations, no FastAPI dependency."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any


# ── Internal helpers ─────────────────────────────────────────────


def _run_git(path: str, *args: str) -> str:
    """Run a git command and return stdout.  Raises ValueError on error."""
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=path,
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            raise ValueError(result.stderr.strip())
        return result.stdout
    except FileNotFoundError:
        raise ValueError("Git not found on this system")
    except subprocess.TimeoutExpired:
        raise ValueError("Git command timed out")


def _run_git_detailed(path: str, *args: str) -> dict[str, Any]:
    """Run git command and return full result (for console logging)."""
    cmd = ["git", *args]
    try:
        result = subprocess.run(cmd, cwd=path, capture_output=True, text=True, timeout=60)
        return {
            "command": " ".join(cmd),
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }
    except FileNotFoundError:
        return {"command": " ".join(cmd), "stdout": "", "stderr": "Git not found", "returncode": -1}
    except subprocess.TimeoutExpired:
        return {"command": " ".join(cmd), "stdout": "", "stderr": "Timed out", "returncode": -1}


# ── Public API ──────────────────────────────────────────────────


def _ensure_git_user_config(repo_root: str) -> None:
    """Set repo-local user.name/user.email if not configured."""
    try:
        import getpass
        import socket
        name = subprocess.run(
            ["git", "config", "user.name"], cwd=repo_root, capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        email = subprocess.run(
            ["git", "config", "user.email"], cwd=repo_root, capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        if not name:
            subprocess.run(
                ["git", "config", "user.name", getpass.getuser()],
                cwd=repo_root, capture_output=True, timeout=5,
            )
        if not email:
            subprocess.run(
                ["git", "config", "user.email", f"{getpass.getuser()}@{socket.gethostname()}"],
                cwd=repo_root, capture_output=True, timeout=5,
            )
    except Exception:
        pass  # non-blocking


def resolve_path(path: str) -> str:
    return str(Path(path).resolve())


def find_repo_root(path: str) -> str | None:
    """Return the git repo root for a path, or None."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=path, capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return None
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None


def get_branch(repo_root: str) -> tuple[str, str]:
    """Return (branch_name, ref_type) — ref_type is 'branch' or 'commit'."""
    branch = _run_git(repo_root, "branch", "--show-current").strip()
    if branch:
        return branch, "branch"
    try:
        abbr = _run_git(repo_root, "rev-parse", "--abbrev-ref", "HEAD").strip()
        if abbr == "HEAD":
            h = _run_git(repo_root, "rev-parse", "--short", "HEAD").strip()
            return h, "commit"
        return abbr, "branch"
    except ValueError:
        return "", ""


def get_info(path: str) -> dict[str, Any]:
    """Get basic git info for a path."""
    resolved = resolve_path(path)
    repo_root = find_repo_root(resolved)
    if not repo_root:
        return {"is_repo": False}
    branch, ref_type = get_branch(repo_root)
    return {"is_repo": True, "repo_root": repo_root, "branch": branch, "ref_type": ref_type}


def get_status(repo_root: str) -> dict[str, Any]:
    """Get working tree status."""
    output = _run_git(repo_root, "status", "--porcelain", "-u")
    entries = []
    for line in output.strip().split("\n"):
        if not line.strip():
            continue
        status_code = line[:2]
        filename = line[3:].strip()
        if status_code == "??":
            status = "untracked"
        elif status_code in ("UU", "AA", "DD"):
            status = "conflicted"
        elif "M" in status_code:
            status = "modified"
        elif "A" in status_code:
            status = "added"
        elif "D" in status_code:
            status = "deleted"
        elif "R" in status_code:
            status = "renamed"
        elif "C" in status_code:
            status = "copied"
        else:
            status = "changed"
        staged = line[0] != " " and line[0] != "?"
        entries.append({"file": filename, "status": status, "staged": staged})
    branch, ref_type = get_branch(repo_root)
    return {"entries": entries, "branch": branch, "ref_type": ref_type, "repo_root": repo_root}


def get_diff(repo_root: str, file: str = "", cached: bool = False) -> dict[str, Any]:
    """Return unified diff. Parses multi-file diffs if no file specified."""
    args = ["diff", "--unified=5"]
    if cached:
        args.append("--cached")
    if file:
        args.extend(["--", file])
    output = _run_git(repo_root, *args)
    if file:
        return {"diff": output, "file": file}
    diffs: list[dict] = []
    current: list[str] = []
    current_file = ""
    for line in output.split("\n"):
        if line.startswith("diff --git"):
            if current_file and current:
                diffs.append({"file": current_file, "diff": "\n".join(current)})
            current = [line]
            parts = line.split(" b/")
            current_file = parts[-1] if len(parts) > 1 else ""
        elif current is not None:
            current.append(line)
    if current_file and current:
        diffs.append({"file": current_file, "diff": "\n".join(current)})
    return {"diffs": diffs}


def stage(repo_root: str, files: list[str]) -> dict[str, Any]:
    """Stage files (git add)."""
    result = _run_git_detailed(repo_root, "add", *files)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    return result


def unstage(repo_root: str, files: list[str]) -> dict[str, Any]:
    """Unstage files (git reset HEAD --)."""
    result = _run_git_detailed(repo_root, "reset", "HEAD", "--", *files)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    return result


def commit_staged(repo_root: str, message: str, author: str = "") -> dict[str, Any]:
    """Commit only staged changes."""
    # Ensure git user config is set — use repo-local config to avoid side effects
    _ensure_git_user_config(repo_root)
    args = ["commit", "-m", message]
    if author:
        args.extend(["--author", author])
    result = _run_git_detailed(repo_root, *args)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    short_hash = ""
    for part in result["stdout"].split():
        if len(part) == 7 and all(c in "0123456789abcdef" for c in part.lower()):
            short_hash = part
            break
    return {"ok": True, "hash": short_hash, **result}


def discard(repo_root: str, files: list[str]) -> dict[str, Any]:
    """Discard changes in working tree for the given files."""
    if not files:
        raise ValueError("No files specified for discard")
    result = _run_git_detailed(repo_root, "checkout", "--", *files)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    return result


def pull(repo_root: str, remote: str = "", branch: str = "", rebase_flag: bool = False) -> dict[str, Any]:
    """Pull from remote."""
    args = ["pull"]
    if rebase_flag:
        args.append("--rebase")
    if remote:
        args.append(remote)
    if branch:
        args.append(branch)
    return _run_git_detailed(repo_root, *args)


def push(repo_root: str, remote: str = "", branch: str = "") -> dict[str, Any]:
    """Push to remote."""
    args = ["push"]
    if remote:
        args.append(remote)
    if branch:
        args.append(branch)
    return _run_git_detailed(repo_root, *args)


def fetch(repo_root: str, remote: str = "", branch: str = "") -> dict[str, Any]:
    """Fetch from remote. Uses remote/branch when provided, otherwise --all --prune."""
    if remote or branch:
        args = ["fetch"]
        if remote:
            args.append(remote)
        if branch:
            args.append(branch)
    else:
        args = ["fetch", "--all", "--prune"]
    return _run_git_detailed(repo_root, *args)


def merge(repo_root: str, branch: str) -> dict[str, Any]:
    """Merge a branch into current."""
    result = _run_git_detailed(repo_root, "merge", branch)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    return result


def stash(repo_root: str, action: str, message: str = "", index: int = 0) -> dict[str, Any]:
    """Stash operations: push, pop, list, drop, apply."""
    if action == "push":
        args = ["stash", "push"]
        if message:
            args.extend(["-m", message])
    elif action == "pop":
        args = ["stash", "pop"]
        if index > 0:
            args.append(f"stash@{{{index}}}")
    elif action == "list":
        args = ["stash", "list"]
    elif action == "drop":
        args = ["stash", "drop"]
        if index > 0:
            args.append(f"stash@{{{index}}}")
    elif action == "apply":
        args = ["stash", "apply"]
        if index > 0:
            args.append(f"stash@{{{index}}}")
    else:
        raise ValueError(f"Unknown stash action: {action}")

    result = _run_git_detailed(repo_root, *args)
    # Stash "list" returning empty or "No local changes" is not an error
    if result["returncode"] != 0 and action not in ("list",):
        stderr = result["stderr"].strip()
        # "No local changes to save" is informational, not an error
        if "no local changes" not in stderr.lower():
            raise ValueError(stderr)
    return result


def create_branch(repo_root: str, name: str, start_point: str = "", switch: bool = True) -> dict[str, Any]:
    """Create a new branch, optionally switch to it."""
    if switch:
        args = ["checkout", "-b", name]
        if start_point:
            args.append(start_point)
    else:
        args = ["branch", name]
        if start_point:
            args.append(start_point)
    result = _run_git_detailed(repo_root, *args)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    return result


def list_branches(repo_root: str) -> dict[str, Any]:
    """List all branches with current branch info."""
    current, _ = get_branch(repo_root)
    output = _run_git(repo_root, "branch", "-a")
    branches = []
    for line in output.strip().split("\n"):
        raw = line.strip()
        is_current = raw.startswith("*")
        name = raw.lstrip("*").lstrip("+").strip()
        if not name or name == "(HEAD detached":
            continue
        try:
            date = _run_git(repo_root, "log", name, "-1", "--format=%ar").strip()
        except ValueError:
            date = ""
        branches.append({"name": name, "current": is_current, "last_commit": date})
    return {"branches": branches, "current": current}


def get_log(repo_root: str, count: int = 20, skip: int = 0) -> dict[str, Any]:
    """Return commit log with ASCII graph."""
    output = _run_git(
        repo_root,
        "log",
        f"--skip={skip}",
        f"-{count}",
        "--format=%H|%h|%an|%s|%ar|%D",
        "--graph",
        "--decorate",
        "--all",
    )
    commits = []
    for line in output.strip().split("\n"):
        if not line.strip():
            continue
        graph_end = 0
        for i, ch in enumerate(line):
            if ch in ("*", "|", "/", "\\", " ", "○", "●"):
                graph_end = i + 1
            else:
                break
        graph_line = line[:graph_end].rstrip()
        rest = line[graph_end:].strip()
        if "|" in rest:
            parts = rest.split("|", 5)
            if len(parts) >= 5:
                commits.append({
                    "hash_full": parts[0],
                    "hash": parts[1],
                    "author": parts[2],
                    "message": parts[3],
                    "time": parts[4],
                    "refs": parts[5] if len(parts) > 5 else "",
                    "graph_line": graph_line,
                })
    return {"commits": commits}


def compare(repo_root: str, base: str, target: str = "") -> dict[str, Any]:
    """Compare two branches: files changed, ahead/behind counts."""
    if not target:
        target = get_branch(repo_root)[0] or "HEAD"
    try:
        diff_output = _run_git(repo_root, "diff", f"{base}...{target}", "--name-status")
    except ValueError:
        diff_output = ""
    files = []
    for line in diff_output.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("\t", 1)
        if len(parts) == 2:
            files.append({"file": parts[1].strip(), "status": parts[0].strip()})
    try:
        ahead = _run_git(repo_root, "rev-list", "--count", f"{target}...{base}").strip()
    except ValueError:
        ahead = "0"
    try:
        behind = _run_git(repo_root, "rev-list", "--count", f"{base}...{target}").strip()
    except ValueError:
        behind = "0"
    return {
        "base": base,
        "target": target,
        "ahead": int(ahead or "0"),
        "behind": int(behind or "0"),
        "files": files,
    }


def list_remotes(repo_root: str) -> dict[str, Any]:
    """List configured remotes."""
    output = _run_git(repo_root, "remote", "-v")
    remotes = []
    for line in output.strip().split("\n"):
        parts = line.split()
        if len(parts) >= 2:
            name = parts[0]
            url = parts[1]
            if name and not any(r["name"] == name for r in remotes):
                remotes.append({"name": name, "url": url})
    return {"remotes": remotes}


def checkout(repo_root: str, branch: str, create: bool = False) -> dict[str, Any]:
    """Checkout a branch, with auto-stash if working tree is dirty."""
    branch = branch.strip().lstrip("+").strip()
    try:
        if create:
            _run_git(repo_root, "checkout", "-b", branch)
        else:
            _run_git(repo_root, "checkout", branch)
    except ValueError as e:
        err_msg = str(e)
        is_dirty_error = any(kw in err_msg.lower() for kw in
                             ["overwritten", "would be", "please commit", "local changes"])
        if is_dirty_error:
            _run_git(repo_root, "stash", "push", "-m", "auto-stash before checkout")
            if create:
                _run_git(repo_root, "checkout", "-b", branch)
            else:
                _run_git(repo_root, "checkout", branch)
            _run_git(repo_root, "stash", "pop")
            return {"ok": True, "branch": branch, "stashed": True}
        raise ValueError(err_msg)
    return {"ok": True, "branch": branch}


# ── Phase 2 operations ────────────────────────────────────────────


def cherry_pick(repo_root: str, commits: list[str], no_commit: bool = False) -> dict[str, Any]:
    """Cherry-pick commits into current branch."""
    if not commits:
        raise ValueError("No commits specified")
    args = ["cherry-pick"]
    if no_commit:
        args.append("--no-commit")
    args.extend(commits)
    result = _run_git_detailed(repo_root, *args)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    return result


def revert_commit(repo_root: str, commit: str, no_commit: bool = False) -> dict[str, Any]:
    """Revert a commit."""
    args = ["revert", "--no-edit"]
    if no_commit:
        args.append("--no-commit")
    args.append(commit)
    result = _run_git_detailed(repo_root, *args)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    return result


def list_tags(repo_root: str) -> dict[str, Any]:
    """List all tags with commit info."""
    output = _run_git(repo_root, "tag", "-l", "--sort=-v:refname")
    tags = []
    for name in output.strip().split("\n"):
        if not name.strip():
            continue
        try:
            commit_hash = _run_git(repo_root, "rev-parse", "--short", name).strip()
            date = _run_git(repo_root, "log", "-1", "--format=%ar", name).strip()
            message = _run_git(repo_root, "tag", "-l", "--format=%(contents:subject)", name).strip()
        except ValueError:
            commit_hash = ""
            date = ""
            message = ""
        tags.append({"name": name, "commit": commit_hash, "date": date, "message": message})
    return {"tags": tags}


def create_tag(repo_root: str, name: str, message: str = "", commit: str = "") -> dict[str, Any]:
    """Create a tag (lightweight or annotated)."""
    args = ["tag"]
    if message:
        args.extend(["-a", name, "-m", message])
    else:
        args.append(name)
    if commit:
        args.append(commit)
    result = _run_git_detailed(repo_root, *args)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    return result


def delete_tag(repo_root: str, name: str) -> dict[str, Any]:
    """Delete a tag."""
    result = _run_git_detailed(repo_root, "tag", "-d", name)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    return result


def rebase(repo_root: str, onto: str, branch: str = "") -> dict[str, Any]:
    """Rebase current or specified branch onto another branch."""
    args = ["rebase", onto]
    if branch:
        args.append(branch)
    result = _run_git_detailed(repo_root, *args)
    if result["returncode"] != 0:
        stderr = result["stderr"].strip()
        if "CONFLICT" in stderr:
            return {"status": "conflict", "stderr": stderr, **result}
        raise ValueError(stderr)
    return result


# ── Phase 3: Conflict detection & resolution ─────────────────────────


def detect_conflicts(repo_root: str) -> list[dict[str, Any]]:
    """Detect conflicted files and extract merge conflict segments."""
    try:
        output = _run_git(repo_root, "diff", "--name-only", "--diff-filter=U")
    except ValueError:
        return []
    files = [f.strip() for f in output.strip().split("\n") if f.strip()]

    result: list[dict[str, Any]] = []
    for file in files:
        try:
            raw_diff = _run_git(repo_root, "diff", "--unified=5", "--", file)
        except ValueError:
            raw_diff = ""
        filepath = os.path.join(repo_root, file)
        segments: list[dict[str, str]] = []
        try:
            with open(filepath) as fh:
                content = fh.read()
        except (FileNotFoundError, IOError):
            content = ""
        current_type = "context"
        current_lines: list[str] = []
        in_conflict = False
        for line in content.split("\n"):
            if line.startswith("<<<<<<<"):
                if current_lines:
                    segments.append({"type": current_type, "content": "\n".join(current_lines)})
                current_lines = []
                current_type = "ours"
                in_conflict = True
            elif line.startswith("=======") and in_conflict:
                if current_lines:
                    segments.append({"type": current_type, "content": "\n".join(current_lines)})
                current_lines = []
                current_type = "theirs"
            elif line.startswith(">>>>>>>") and in_conflict:
                if current_lines:
                    segments.append({"type": current_type, "content": "\n".join(current_lines)})
                current_lines = []
                current_type = "context"
                in_conflict = False
            else:
                current_lines.append(line)
        if current_lines:
            segments.append({"type": current_type, "content": "\n".join(current_lines)})
        result.append({"file": file, "segments": segments, "raw_diff": raw_diff})
    return result


def resolve_conflict(repo_root: str, file: str, strategy: str = "ours", content: str = "") -> dict[str, Any]:
    """Resolve a conflict in one or all files."""
    if strategy in ("ours", "theirs"):
        flag = f"--{strategy}"
        try:
            result = _run_git_detailed(repo_root, "checkout", flag, file)
            _run_git_detailed(repo_root, "add", file)
            return {"file": file, "strategy": strategy, "ok": True, **result}
        except ValueError as e:
            raise ValueError(f"Resolve failed: {e}")
    elif strategy == "manual":
        if not content:
            raise ValueError("Manual resolution requires content")
        full_path = os.path.join(repo_root, file) if not os.path.isabs(file) else file
        try:
            with open(full_path, "w") as fh:
                fh.write(content)
            _run_git_detailed(repo_root, "add", file)
            return {"file": file, "strategy": "manual", "ok": True}
        except (FileNotFoundError, IOError) as e:
            raise ValueError(f"Failed to write resolved content: {e}")
    else:
        raise ValueError(f"Unknown strategy: {strategy}")


def get_diff_numbered(repo_root: str, file: str = "", cached: bool = False) -> dict[str, Any]:
    """Return unified diff with line numbers attached to each hunk."""
    args = ["diff", "--unified=5"]
    if cached:
        args.append("--cached")
    if file:
        args.extend(["--", file])
    try:
        output = _run_git(repo_root, *args)
    except ValueError as e:
        raise ValueError(e)

    if file:
        hunks = _parse_numbered_hunks(output)
        return {"diff": output, "file": file, "hunks": hunks}

    diffs: list[dict] = []
    current: list[str] = []
    current_file = ""
    for line in output.split("\n"):
        if line.startswith("diff --git"):
            if current_file and current:
                hunks = _parse_numbered_hunks("\n".join(current))
                diffs.append({"file": current_file, "diff": "\n".join(current), "hunks": hunks})
            current = [line]
            parts = line.split(" b/")
            current_file = parts[-1] if len(parts) > 1 else ""
        elif current is not None:
            current.append(line)
    if current_file and current:
        hunks = _parse_numbered_hunks("\n".join(current))
        diffs.append({"file": current_file, "diff": "\n".join(current), "hunks": hunks})
    return {"diffs": diffs}


def _parse_numbered_hunks(diff_output: str) -> list[dict[str, Any]]:
    """Parse unified diff and return hunks with line numbers."""
    import re
    hunks: list[dict[str, Any]] = []
    current_hunk: dict[str, Any] | None = None
    old_ln = 0
    new_ln = 0

    for line in diff_output.split("\n"):
        hunk_match = re.match(r"^@@ -(\d+),?\d* \+(\d+),?\d* @@(.*)", line)
        if hunk_match:
            if current_hunk:
                hunks.append(current_hunk)
            old_ln = int(hunk_match.group(1))
            new_ln = int(hunk_match.group(2))
            current_hunk = {
                "old_start": old_ln,
                "new_start": new_ln,
                "header": line,
                "lines": [],
            }
        elif current_hunk is not None:
            if line.startswith("+"):
                current_hunk["lines"].append({"type": "added", "old_ln": None, "new_ln": new_ln, "text": line})
                new_ln += 1
            elif line.startswith("-"):
                current_hunk["lines"].append({"type": "removed", "old_ln": old_ln, "new_ln": None, "text": line})
                old_ln += 1
            else:
                current_hunk["lines"].append({"type": "context", "old_ln": old_ln, "new_ln": new_ln, "text": line})
                old_ln += 1
                new_ln += 1
    if current_hunk:
        hunks.append(current_hunk)
    return hunks


# ── Phase 4: Rebase operations ──────────────────────────────────────


def rebase_plan(repo_root: str, branch: str = "", onto: str = "") -> dict[str, Any]:
    """Get the list of commits that would be rebased."""
    args = ["log", "--reverse", "--format=%H|%h|%an|%s", "--no-decorate"]
    if branch and onto:
        args.append(f"{onto}..{branch}")
    elif onto:
        current = get_branch(repo_root)[0] or "HEAD"
        args.append(f"{onto}..{current}")
    try:
        output = _run_git(repo_root, *args)
    except ValueError:
        return {"commits": []}
    commits = []
    for line in output.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("|", 4)
        if len(parts) >= 4:
            commits.append({
                "hash_full": parts[0],
                "hash": parts[1],
                "author": parts[2],
                "message": parts[3],
            })
    return {"commits": commits}


def rebase_interactive(repo_root: str, onto: str, actions: list[dict[str, str]]) -> dict[str, Any]:
    """Execute interactive rebase with custom todo list."""
    import tempfile
    import os as _os

    # Write the todo list
    todo_lines = []
    for a in actions:
        action = a.get("action", "pick")
        commit_hash = a.get("commit_hash", "")
        msg = a.get("message", "")
        if not commit_hash:
            continue
        if action == "drop":
            todo_lines.append(f"drop {commit_hash} {msg}")
        elif action == "pick":
            todo_lines.append(f"pick {commit_hash} {msg}")
        elif action == "reword":
            todo_lines.append(f"reword {commit_hash} {msg}")
        elif action == "edit":
            todo_lines.append(f"edit {commit_hash} {msg}")
        elif action == "squash":
            todo_lines.append(f"squash {commit_hash} {msg}")
        elif action == "fixup":
            todo_lines.append(f"fixup {commit_hash} {msg}")
        else:
            todo_lines.append(f"pick {commit_hash} {msg}")

    if not todo_lines:
        raise ValueError("No todo items to rebase")

    # Write the todo list to a temp file
    tmp = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix="_git_rebase_todo")
    try:
        tmp.write("\n".join(todo_lines) + "\n")
        tmp.close()

        # Create a sequence editor script that copies our todo file
        editor_script = None
        try:
            # On Unix: use a shell script that copies our file
            editor_tmp = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix="_git_sequencer")
            editor_tmp.write("#!/bin/sh\n")
            editor_tmp.write(f"cat {tmp.name} > \"$1\"\n")
            editor_tmp.close()
            _os.chmod(editor_tmp.name, 0o755)

            env = _os.environ.copy()
            env["GIT_SEQUENCE_EDITOR"] = f"sh {editor_tmp.name}"
            cmd = ["git", "rebase", "-i", onto]
            result = subprocess.run(
                cmd, cwd=repo_root, capture_output=True, text=True, timeout=120,
                env=env,
            )
            ret = {
                "command": " ".join(cmd),
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
            }
            if result.returncode != 0:
                stderr = result.stderr.strip()
                if "CONFLICT" in stderr or "conflict" in stderr.lower():
                    ret["status"] = "conflict"
                else:
                    raise ValueError(stderr)
            return ret
        finally:
            if editor_tmp and _os.path.exists(editor_tmp.name):
                _os.unlink(editor_tmp.name)
    finally:
        _os.unlink(tmp.name)


def rebase_status(repo_root: str) -> dict[str, Any]:
    """Check if a rebase is in progress."""
    try:
        # Check for .git/REBASE_HEAD or rebase-merge directory
        head = _run_git(repo_root, "rev-parse", "--git-dir").strip()
        rebase_dir = os.path.join(repo_root, head, "rebase-merge")
        apply_dir = os.path.join(repo_root, head, "rebase-apply")
        in_progress = os.path.isdir(rebase_dir) or os.path.isdir(apply_dir)
        if not in_progress:
            return {"in_progress": False}
        # Get the current commit being applied
        current = ""
        onto = ""
        try:
            onto_path = os.path.join(rebase_dir if os.path.isdir(rebase_dir) else apply_dir, "onto")
            if os.path.exists(onto_path):
                with open(onto_path) as fh:
                    onto = fh.read().strip()
        except (FileNotFoundError, IOError):
            pass
        return {"in_progress": True, "onto": onto, "dir": "rebase-merge" if os.path.isdir(rebase_dir) else "rebase-apply"}
    except (ValueError, FileNotFoundError, IOError):
        return {"in_progress": False}


def rebase_continue(repo_root: str) -> dict[str, Any]:
    """Continue a rebase after conflict resolution."""
    args = ["rebase", "--continue"]
    # Check if there's anything to commit
    try:
        result = _run_git_detailed(repo_root, *args)
        if result["returncode"] != 0:
            stderr = result["stderr"].strip()
            if "CONFLICT" in stderr or "conflict" in stderr.lower():
                result["status"] = "conflict"
            elif "no changes" in stderr.lower() or "nothing to commit" in stderr.lower():
                # Try skip if no changes
                result["status"] = "no-changes"
            raise ValueError(stderr)
        return result
    except ValueError as e:
        raise ValueError(e)


def rebase_abort(repo_root: str) -> dict[str, Any]:
    """Abort a rebase in progress."""
    return _run_git_detailed(repo_root, "rebase", "--abort")


def rebase_skip(repo_root: str) -> dict[str, Any]:
    """Skip the current commit during rebase."""
    result = _run_git_detailed(repo_root, "rebase", "--skip")
    if result["returncode"] != 0:
        stderr = result["stderr"].strip()
        if "CONFLICT" in stderr or "conflict" in stderr.lower():
            result["status"] = "conflict"
        raise ValueError(stderr)
    return result


def merge_safe(repo_root: str, branch: str) -> dict[str, Any]:
    """Merge with auto-stash if working tree is dirty."""
    # Check if working tree is dirty
    try:
        status = _run_git(repo_root, "status", "--porcelain").strip()
    except ValueError:
        status = ""
    stashed = False
    if status:
        _run_git(repo_root, "stash", "push", "-m", "auto-stash before merge")
        stashed = True
    result = _run_git_detailed(repo_root, "merge", branch)
    if stashed:
        _run_git(repo_root, "stash", "pop")
    if result["returncode"] != 0:
        # If merge failed, don't raise — return status so FE can handle
        stderr = result["stderr"].strip()
        if "CONFLICT" in stderr or "conflict" in stderr.lower():
            result["status"] = "conflict"
        else:
            raise ValueError(stderr)
    result["stashed"] = stashed
    return result


def clone_repo(url: str, target_dir: str = "", branch: str = "") -> dict[str, Any]:
    """Clone a remote repository. target_dir is the full path for the cloned repo."""
    import os as _os
    if not target_dir:
        raise ValueError("target_dir is required")
    parent = _os.path.dirname(target_dir)
    if parent and not _os.path.exists(parent):
        _os.makedirs(parent, exist_ok=True)
    args = ["clone"]
    if branch:
        args.extend(["-b", branch])
    args.append(url)
    args.append(target_dir)
    result = _run_git_detailed(parent if parent else ".", *args)
    if result["returncode"] != 0:
        raise ValueError(result["stderr"].strip())
    result["cloned_path"] = _os.path.abspath(target_dir)
    return result
