"""Git API — thin router delegating to services/git_service.py."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from core.state import (
    GitCheckoutRequest,
    GitCherryPickRequest,
    GitCommitRequest,
    GitCreateBranchRequest,
    GitCreateTagRequest,
    GitDeleteTagRequest,
    GitDiscardRequest,
    GitMergeRequest,
    GitRebaseRequest,
    GitRemoteOpRequest,
    GitRevertRequest,
    GitStageRequest,
    GitStashRequest,
    GitBranchListRequest,
    GitStashListRequest,
    ConflictResolveRequest,
    RebasePlanRequest,
    RebaseInteractiveRequest,
    RebaseStatusRequest,
    RebaseContinueRequest,
    RebaseAbortRequest,
    RebaseSkipRequest,
    GitMergeSafeRequest,
)
from services import git_service

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────


def _require_repo(path: str) -> str:
    """Resolve path and return repo_root or raise 400."""
    resolved = git_service.resolve_path(path)
    repo_root = git_service.find_repo_root(resolved)
    if not repo_root:
        raise HTTPException(400, "Not a git repository")
    return repo_root


# ── Endpoints ──────────────────────────────────────────────────────


@router.get("/api/git/info")
async def git_info(path: str = "."):
    return git_service.get_info(path)


@router.get("/api/git/status")
async def git_status(path: str = "."):
    repo_root = _require_repo(path)
    return git_service.get_status(repo_root)


@router.get("/api/git/diff")
async def git_diff(path: str = ".", file: str = "", cached: bool = Query(default=False, alias="cached"), format: str = ""):
    repo_root = _require_repo(path)
    try:
        if format == "numbered":
            return git_service.get_diff_numbered(repo_root, file=file, cached=cached)
        return git_service.get_diff(repo_root, file=file, cached=cached)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/api/git/stage")
async def git_stage(req: GitStageRequest):
    repo_root = _require_repo(req.path)
    files = req.files if req.files else ["."]
    try:
        return git_service.stage(repo_root, files)
    except ValueError as e:
        raise HTTPException(400, f"Stage failed: {e}")


@router.post("/api/git/unstage")
async def git_unstage(req: GitStageRequest):
    repo_root = _require_repo(req.path)
    files = req.files if req.files else ["."]
    try:
        return git_service.unstage(repo_root, files)
    except ValueError as e:
        raise HTTPException(400, f"Unstage failed: {e}")


@router.post("/api/git/commit-staged")
async def git_commit_staged(req: GitCommitRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.commit_staged(repo_root, req.message, req.author)
    except ValueError as e:
        raise HTTPException(400, f"Commit failed: {e}")


@router.post("/api/git/discard")
async def git_discard(req: GitDiscardRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.discard(repo_root, req.files)
    except ValueError as e:
        raise HTTPException(400, f"Discard failed: {e}")


@router.post("/api/git/pull")
async def git_pull(req: GitRemoteOpRequest):
    repo_root = _require_repo(req.path)
    return git_service.pull(repo_root, req.remote, req.branch, req.rebase)


@router.post("/api/git/push")
async def git_push(req: GitRemoteOpRequest):
    repo_root = _require_repo(req.path)
    return git_service.push(repo_root, req.remote, req.branch)


@router.post("/api/git/fetch")
async def git_fetch(req: GitRemoteOpRequest):
    repo_root = _require_repo(req.path)
    return git_service.fetch(repo_root, req.remote, req.branch)


@router.post("/api/git/merge")
async def git_merge(req: GitMergeSafeRequest):
    repo_root = _require_repo(req.path)
    try:
        if req.stash_on_dirty:
            return git_service.merge_safe(repo_root, req.branch)
        return git_service.merge(repo_root, req.branch)
    except ValueError as e:
        raise HTTPException(400, f"Merge failed: {e}")


@router.post("/api/git/stash")
async def git_stash(req: GitStashRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.stash(repo_root, req.action, req.message, req.index)
    except ValueError as e:
        raise HTTPException(400, f"Stash {req.action} failed: {e}")


@router.post("/api/git/create-branch")
async def git_create_branch(req: GitCreateBranchRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.create_branch(repo_root, req.name, req.start_point, req.switch)
    except ValueError as e:
        raise HTTPException(400, f"Create branch failed: {e}")


@router.post("/api/git/branches")
async def git_branches(req: GitBranchListRequest):
    repo_root = _require_repo(req.path)
    return git_service.list_branches(repo_root)


@router.get("/api/git/log/detail")
async def git_log_detail(path: str = ".", count: int = Query(default=20), skip: int = Query(default=0)):
    repo_root = _require_repo(path)
    return git_service.get_log(repo_root, count, skip)


@router.get("/api/git/compare")
async def git_compare(path: str = ".", base: str = "", target: str = ""):
    repo_root = _require_repo(path)
    return git_service.compare(repo_root, base, target)


@router.get("/api/git/remotes")
async def git_remotes(path: str = "."):
    repo_root = _require_repo(path)
    return git_service.list_remotes(repo_root)


@router.post("/api/git/checkout")
async def git_checkout(req: GitCheckoutRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.checkout(repo_root, req.branch, req.create)
    except ValueError as e:
        raise HTTPException(400, f"Checkout failed: {e}")


# ── Phase 2 endpoints ──────────────────────────────────────────────


@router.post("/api/git/cherry-pick")
async def git_cherry_pick(req: GitCherryPickRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.cherry_pick(repo_root, req.commits, req.no_commit)
    except ValueError as e:
        raise HTTPException(400, f"Cherry-pick failed: {e}")


@router.post("/api/git/revert")
async def git_revert(req: GitRevertRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.revert_commit(repo_root, req.commit, req.no_commit)
    except ValueError as e:
        raise HTTPException(400, f"Revert failed: {e}")


@router.get("/api/git/tags")
async def git_tags(path: str = "."):
    repo_root = _require_repo(path)
    return git_service.list_tags(repo_root)


@router.post("/api/git/tags")
async def git_create_tag(req: GitCreateTagRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.create_tag(repo_root, req.name, req.message, req.commit)
    except ValueError as e:
        raise HTTPException(400, f"Create tag failed: {e}")


@router.delete("/api/git/tags")
async def git_delete_tag(req: GitDeleteTagRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.delete_tag(repo_root, req.name)
    except ValueError as e:
        raise HTTPException(400, f"Delete tag failed: {e}")


@router.post("/api/git/rebase")
async def git_rebase(req: GitRebaseRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.rebase(repo_root, req.onto, req.branch)
    except ValueError as e:
        raise HTTPException(400, f"Rebase failed: {e}")


@router.get("/api/git/stash")
async def git_stash_list(req: GitStashListRequest):
    repo_root = _require_repo(req.path)
    return git_service.stash(repo_root, "list")


# ── Phase 3 endpoints ──────────────────────────────────────────────


@router.get("/api/git/conflicts")
async def git_conflicts(path: str = "."):
    repo_root = _require_repo(path)
    return {"conflicted": git_service.detect_conflicts(repo_root)}


@router.post("/api/git/resolve")
async def git_resolve(req: ConflictResolveRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.resolve_conflict(repo_root, req.file, req.strategy, req.content)
    except ValueError as e:
        raise HTTPException(400, f"Resolve failed: {e}")


# ── Phase 4 endpoints ──────────────────────────────────────────────


@router.post("/api/git/rebase/plan")
async def git_rebase_plan(req: RebasePlanRequest):
    repo_root = _require_repo(req.path)
    return git_service.rebase_plan(repo_root, req.branch, req.onto)


@router.post("/api/git/rebase/interactive")
async def git_rebase_interactive(req: RebaseInteractiveRequest):
    repo_root = _require_repo(req.path)
    try:
        actions = [a.model_dump() if hasattr(a, "model_dump") else dict(a) for a in req.actions]
        return git_service.rebase_interactive(repo_root, req.onto, actions)
    except ValueError as e:
        raise HTTPException(400, f"Interactive rebase failed: {e}")


@router.post("/api/git/rebase/status")
async def git_rebase_status(req: RebaseStatusRequest):
    repo_root = _require_repo(req.path)
    return git_service.rebase_status(repo_root)


@router.post("/api/git/rebase/continue")
async def git_rebase_continue(req: RebaseContinueRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.rebase_continue(repo_root)
    except ValueError as e:
        raise HTTPException(400, f"Rebase continue failed: {e}")


@router.post("/api/git/rebase/abort")
async def git_rebase_abort(req: RebaseAbortRequest):
    repo_root = _require_repo(req.path)
    return git_service.rebase_abort(repo_root)


@router.post("/api/git/rebase/skip")
async def git_rebase_skip(req: RebaseSkipRequest):
    repo_root = _require_repo(req.path)
    try:
        return git_service.rebase_skip(repo_root)
    except ValueError as e:
        raise HTTPException(400, f"Rebase skip failed: {e}")
