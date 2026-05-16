"""Git API — status, diff, stage, commit, branch, pull/push, stash, log."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────


def _run_git(path: str, *args: str) -> str:
    """Run a git command and return stdout.  Raises HTTPException on error."""
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=path,
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            raise HTTPException(400, f"Git error: {result.stderr.strip()}")
        return result.stdout
    except FileNotFoundError:
        raise HTTPException(400, "Git not found on this system")
    except subprocess.TimeoutExpired:
        raise HTTPException(408, "Git command timed out")


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


def _find_repo_root(path: str) -> str | None:
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


def _get_branch(repo_root: str) -> tuple[str, str]:
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
    except HTTPException:
        return "", ""


# ── Existing endpoints ──────────────────────────────────────────────


@router.get("/api/git/info")
async def git_info(path: str = "."):
    resolved = str(Path(path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        return {"is_repo": False}
    branch, ref_type = _get_branch(repo_root)
    return {"is_repo": True, "repo_root": repo_root, "branch": branch, "ref_type": ref_type}


@router.get("/api/git/status")
async def git_status(path: str = "."):
    resolved = str(Path(path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")

    output = _run_git(repo_root, "status", "--porcelain", "-u")
    entries = []
    for line in output.strip().split("\n"):
        if not line.strip():
            continue
        status_code = line[:2]
        filename = line[3:].strip()
        # Parse status
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

    branch, ref_type = _get_branch(repo_root)
    return {"entries": entries, "branch": branch, "ref_type": ref_type, "repo_root": repo_root}


# ── Diff ────────────────────────────────────────────────────────────


@router.get("/api/git/diff")
async def git_diff(path: str = ".", file: str = "", cached: bool = Query(default=False, alias="cached")):
    """Return unified diff. If file is empty, return all unstaged diffs."""
    resolved = str(Path(path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")

    args = ["diff", "--unified=5"]
    if cached:
        args.append("--cached")
    if file:
        args.append("--", file)

    output = _run_git(repo_root, *args)
    if file:
        return {"diff": output, "file": file}
    # Parse multiple file diffs
    diffs: list[dict] = []
    current: list[str] = []
    current_file = ""
    for line in output.split("\n"):
        if line.startswith("diff --git"):
            if current_file and current:
                diffs.append({"file": current_file, "diff": "\n".join(current)})
            current = [line]
            # Extract filename from "diff --git a/xxx b/xxx"
            parts = line.split(" b/")
            current_file = parts[-1] if len(parts) > 1 else ""
        elif current is not None:
            current.append(line)
    if current_file and current:
        diffs.append({"file": current_file, "diff": "\n".join(current)})
    return {"diffs": diffs}


# ── Stage / Unstage ────────────────────────────────────────────────


class StageRequest(BaseModel):
    path: str
    files: list[str] = []


@router.post("/api/git/stage")
async def git_stage(req: StageRequest):
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")
    files = req.files if req.files else ["."]
    result = _run_git_detailed(repo_root, "add", *files)
    if result["returncode"] != 0:
        raise HTTPException(400, f"Stage failed: {result['stderr'].strip()}")
    return result


@router.post("/api/git/unstage")
async def git_unstage(req: StageRequest):
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")
    files = req.files if req.files else ["."]
    result = _run_git_detailed(repo_root, "reset", "HEAD", "--", *files)
    if result["returncode"] != 0:
        raise HTTPException(400, f"Unstage failed: {result['stderr'].strip()}")
    return result


# ── Commit ──────────────────────────────────────────────────────────


class CommitStagedRequest(BaseModel):
    path: str
    message: str
    author: str = ""


@router.post("/api/git/commit-staged")
async def git_commit_staged(req: CommitStagedRequest):
    """Commit only staged changes (no auto-stage)."""
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")
    args = ["commit", "-m", req.message]
    if req.author:
        args.extend(["--author", req.author])
    result = _run_git_detailed(repo_root, *args)
    if result["returncode"] != 0:
        raise HTTPException(400, f"Commit failed: {result['stderr'].strip()}")
    # Extract short hash from stdout: "[main abc1234] message"
    short_hash = ""
    for part in result["stdout"].split():
        if len(part) == 7 and all(c in "0123456789abcdef" for c in part.lower()):
            short_hash = part
            break
    return {"ok": True, "hash": short_hash, **result}


# ── Discard ─────────────────────────────────────────────────────────


class DiscardRequest(BaseModel):
    path: str
    files: list[str]


@router.post("/api/git/discard")
async def git_discard(req: DiscardRequest):
    """Discard changes in working tree for the given files."""
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")
    result = _run_git_detailed(repo_root, "checkout", "--", *req.files)
    if result["returncode"] != 0:
        raise HTTPException(400, f"Discard failed: {result['stderr'].strip()}")
    return result


# ── Pull / Push / Fetch ─────────────────────────────────────────────


class GitRemoteOpRequest(BaseModel):
    path: str
    remote: str = ""
    branch: str = ""
    rebase: bool = False


@router.post("/api/git/pull")
async def git_pull(req: GitRemoteOpRequest):
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")
    args = ["pull"]
    if req.rebase:
        args.append("--rebase")
    if req.remote:
        args.append(req.remote)
    if req.branch:
        args.append(req.branch)
    result = _run_git_detailed(repo_root, *args)
    return result


@router.post("/api/git/push")
async def git_push(req: GitRemoteOpRequest):
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")
    args = ["push"]
    if req.remote:
        args.append(req.remote)
    if req.branch:
        args.append(req.branch)
    result = _run_git_detailed(repo_root, *args)
    return result


@router.post("/api/git/fetch")
async def git_fetch(req: GitRemoteOpRequest):
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")
    result = _run_git_detailed(repo_root, "fetch", "--all", "--prune")
    return result


# ── Merge ───────────────────────────────────────────────────────────


class MergeRequest(BaseModel):
    path: str
    branch: str


@router.post("/api/git/merge")
async def git_merge(req: MergeRequest):
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")
    result = _run_git_detailed(repo_root, "merge", req.branch)
    if result["returncode"] != 0:
        raise HTTPException(400, f"Merge failed: {result['stderr'].strip()}")
    return result


# ── Stash ───────────────────────────────────────────────────────────


class StashRequest(BaseModel):
    path: str
    action: str = "push"  # push | pop | list | drop | apply
    message: str = ""
    index: int = 0


@router.post("/api/git/stash")
async def git_stash(req: StashRequest):
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")

    if req.action == "push":
        args = ["stash", "push"]
        if req.message:
            args.extend(["-m", req.message])
    elif req.action == "pop":
        args = ["stash", "pop"]
        if req.index > 0:
            args.append(f"stash@{{{req.index}}}")
    elif req.action == "list":
        args = ["stash", "list"]
    elif req.action == "drop":
        args = ["stash", "drop"]
        if req.index > 0:
            args.append(f"stash@{{{req.index}}}")
    elif req.action == "apply":
        args = ["stash", "apply"]
        if req.index > 0:
            args.append(f"stash@{{{req.index}}}")
    else:
        raise HTTPException(400, f"Unknown stash action: {req.action}")

    result = _run_git_detailed(repo_root, *args)
    if result["returncode"] != 0:
        raise HTTPException(400, f"Stash {req.action} failed: {result['stderr'].strip()}")
    return result


# ── Create branch ──────────────────────────────────────────────────


class CreateBranchRequest(BaseModel):
    path: str
    name: str
    start_point: str = ""
    switch: bool = True


@router.post("/api/git/create-branch")
async def git_create_branch(req: CreateBranchRequest):
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")

    if req.switch:
        args = ["checkout", "-b", req.name]
        if req.start_point:
            args.append(req.start_point)
    else:
        args = ["branch", req.name]
        if req.start_point:
            args.append(req.start_point)

    result = _run_git_detailed(repo_root, *args)
    if result["returncode"] != 0:
        raise HTTPException(400, f"Create branch failed: {result['stderr'].strip()}")
    return result


# ── Branch list (enhanced) ──────────────────────────────────────────


class BranchListRequest(BaseModel):
    path: str


@router.post("/api/git/branches")
async def git_branches(req: BranchListRequest):
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")

    current, _ = _get_branch(repo_root)
    output = _run_git(repo_root, "branch", "-a")
    branches = []
    for line in output.strip().split("\n"):
        raw = line.strip()
        is_current = raw.startswith("*")
        # Remove leading "* " or "+ " or whitespace
        name = raw.lstrip("*").lstrip("+").strip()
        if not name or name == "(HEAD detached":
            continue
        # Get last commit date for each branch
        try:
            date = _run_git(repo_root, "log", name, "-1", "--format=%ar").strip()
        except HTTPException:
            date = ""
        branches.append({"name": name, "current": is_current, "last_commit": date})
    return {"branches": branches, "current": current}


# ── Log ─────────────────────────────────────────────────────────────


@router.get("/api/git/log/detail")
async def git_log_detail(path: str = ".", count: int = Query(default=20), skip: int = Query(default=0)):
    """Return commit log with ASCII graph."""
    resolved = str(Path(path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")

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
        # Split graph prefix from actual log data
        # Graph chars are at start: "*   |  |" etc
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


# ── Branch comparison ──────────────────────────────────────────────


@router.get("/api/git/compare")
async def git_compare(path: str = ".", base: str = "", target: str = ""):
    """Compare two branches: show files changed and commit counts.

    If only ``base`` is given, compares ``base`` vs current branch.
    If both given, compares ``base`` vs ``target``.
    """
    resolved = str(Path(path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")

    if not target:
        target = _get_branch(repo_root)[0] or "HEAD"

    # Files that differ
    try:
        diff_output = _run_git(repo_root, "diff", f"{base}...{target}", "--name-status")
    except HTTPException:
        diff_output = ""

    files = []
    for line in diff_output.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("\t", 1)
        if len(parts) == 2:
            status = parts[0].strip()
            filepath = parts[1].strip()
            files.append({"file": filepath, "status": status})

    # Commits ahead/behind
    try:
        ahead = _run_git(repo_root, "rev-list", "--count", f"{target}...{base}").strip()
    except HTTPException:
        ahead = "0"
    try:
        behind = _run_git(repo_root, "rev-list", "--count", f"{base}...{target}").strip()
    except HTTPException:
        behind = "0"

    return {
        "base": base,
        "target": target,
        "ahead": int(ahead or "0"),
        "behind": int(behind or "0"),
        "files": files,
    }


# ── Remotes ─────────────────────────────────────────────────────────


@router.get("/api/git/remotes")
async def git_remotes(path: str = "."):
    resolved = str(Path(path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")

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


# ── Checkout (existing, improved) ──────────────────────────────────


class CheckoutRequest(BaseModel):
    path: str
    branch: str
    create: bool = False


@router.post("/api/git/checkout")
async def git_checkout(req: CheckoutRequest):
    resolved = str(Path(req.path).resolve())
    repo_root = _find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")

    # Clean branch name — strip whitespace and any leading "+ "
    branch = req.branch.strip().lstrip("+").strip()

    try:
        if req.create:
            _run_git(repo_root, "checkout", "-b", branch)
        else:
            _run_git(repo_root, "checkout", branch)
    except HTTPException as e:
        err_msg = str(e.detail)
        # Check if it's about uncommitted changes
        is_dirty_error = any(kw in err_msg.lower() for kw in
            ["overwritten", "would be", "please commit", "local changes"])
        if is_dirty_error:
            # Stash changes, try checkout, then pop
            _run_git(repo_root, "stash", "push", "-m", "auto-stash before checkout")
            if req.create:
                _run_git(repo_root, "checkout", "-b", req.branch)
            else:
                _run_git(repo_root, "checkout", req.branch)
            _run_git(repo_root, "stash", "pop")
            return {"ok": True, "branch": req.branch, "stashed": True}
        raise HTTPException(400, f"Checkout failed: {err_msg}")
    return {"ok": True, "branch": req.branch}
