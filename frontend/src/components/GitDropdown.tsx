import { useState, useRef, useEffect, useCallback } from "react";
import { useGit, type GitAction } from "../GitContext";
import { gitPush, gitFetch, gitMerge, fetchGitBranches } from "../lib/api";

interface Props {
  onNavigate?: (tab: string, gitView?: string) => void;
  onOpenClone?: () => void;
}

const SECTIONS: { items: { id: GitAction; label: string }[] }[] = [
  {
    items: [
      { id: "commit", label: "Commit..." },
      { id: "push", label: "Push..." },
      { id: "updateProject", label: "Update Project..." },
      { id: "pull", label: "Pull..." },
      { id: "fetch", label: "Fetch" },
    ],
  },
  {
    items: [
      { id: "merge", label: "Merge..." },
      { id: "rebase", label: "Rebase..." },
    ],
  },
  {
    items: [
      { id: "branches", label: "Branches..." },
      { id: "newBranch", label: "New Branch..." },
      { id: "newTag", label: "New Tag..." },
      { id: "resetHead", label: "Reset HEAD..." },
    ],
  },
  {
    items: [
      { id: "newWorktree", label: "New Worktree..." },
      { id: "worktrees", label: "Worktrees..." },
    ],
  },
  {
    items: [
      { id: "showGitLog", label: "Show Git Log" },
      { id: "patchUncommitted", label: "Uncommitted Changes" },
      { id: "patchFile", label: "Selected File..." },
    ],
  },
  {
    items: [
      { id: "manageRemotes", label: "Manage Remotes..." },
      { id: "clone", label: "Clone..." },
    ],
  },
];

export default function GitDropdown({ onNavigate, onOpenClone }: Props) {
  const {
    repoRoot, branch, statusEntries, loading,
    refresh, addConsole, setView,
    showToast, updateToast,
    openDialog,
  } = useGit();

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const changedCount = statusEntries.length;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const runAction = useCallback(async (action: string, exec: () => Promise<void>) => {
    close();
    const toastId = showToast(`Running ${action}...`, "loading");
    try {
      await exec();
      updateToast(toastId, `${action} completed`, "success");
    } catch (err: any) {
      updateToast(toastId, `${action} failed: ${err.message}`, "error");
    }
  }, [close, showToast, updateToast]);

  const handleAction = useCallback(async (action: GitAction) => {
    if (!repoRoot) return;

    switch (action) {
      // ── Simple: close → toast → execute ─────────────
      case "fetch":
        await runAction("fetch", async () => {
          const r = await gitFetch(repoRoot);
          addConsole("fetch", r.stdout || r.stderr || "");
          await refresh();
        });
        break;

      case "push":
        await runAction("push", async () => {
          const r = await gitPush(repoRoot);
          addConsole("push", r.stdout || r.stderr || "");
          await refresh();
        });
        break;

      case "updateProject":
        await runAction("update", async () => {
          const fetchR = await gitFetch(repoRoot);
          addConsole("update", `Fetch: ${fetchR.stdout || fetchR.stderr || ""}`);
          try {
            const mergeR = await gitMerge(repoRoot, branch || "");
            addConsole("update", `Merge: ${mergeR.stdout || mergeR.stderr || ""}`);
          } catch {
            addConsole("update", "No fast-forward merge possible.");
          }
          await refresh();
        });
        break;

      // ── Need input: close → open modal dialog ──────
      case "commit":
        setView("changes");
        close();
        onNavigate?.("git", "changes");
        break;
      case "pull":
      case "merge":
      case "rebase":
      case "newBranch":
      case "newTag":
      case "resetHead":
      case "patchFile":
        close();
        openDialog(action);
        break;

      // ── Navigation: close → switch view ─────────────
      case "branches":
        setView("branches");
        close();
        onNavigate?.("git", "branches");
        break;

      case "showGitLog":
        setView("log");
        close();
        onNavigate?.("git", "log");
        break;

      case "patchUncommitted":
        setView("changes");
        close();
        onNavigate?.("git", "changes");
        break;

      // ── Other ────────────────────────────────────────
      case "clone":
        close();
        onOpenClone?.();
        break;

      case "manageRemotes":
        close();
        addConsole("remotes", "Manage remotes via CLI: git remote -v");
        showToast("Use terminal for remote management", "info");
        break;

      case "newWorktree":
        close();
        addConsole("worktree", "Worktree operations: git worktree add");
        showToast("Use terminal for worktree operations", "info");
        break;

      case "worktrees":
        close();
        addConsole("worktree", "List worktrees: git worktree list");
        showToast("Use terminal for worktree operations", "info");
        break;
    }
  }, [repoRoot, branch, close, onNavigate, onOpenClone, runAction, addConsole, refresh, showToast, openDialog, setView]);

  const noRepo = !repoRoot && !loading;

  // Re-fetch branches on open
  const handleOpen = useCallback(() => {
    if (open) { close(); return; }
    setOpen(true);
    if (repoRoot) {
      fetchGitBranches(repoRoot).then(() => {}).catch(() => {});
    }
  }, [open, repoRoot, close]);

  return (
    <div className="git-dropdown" ref={dropdownRef}>
      <button
        className="header-btn git-dropdown-trigger"
        onClick={handleOpen}
        title={repoRoot ? `Git: ${branch}` : "No Git repository"}
      >
        ⎇ <span className="git-dd-branch">{noRepo ? "No Repo" : branch}{loading ? "..." : ""}</span>
        {changedCount > 0 && <span className="git-dd-count">{changedCount}</span>}
        <span className="git-dd-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="git-dropdown-menu">
          {SECTIONS.map((section, si) => (
            <div key={si} className="git-dd-section">
              {section.items.map((item) => {
                const disabled = noRepo && item.id !== "clone";
                return (
                  <button
                    key={item.id}
                    className={`git-dd-item ${disabled ? "disabled" : ""}`}
                    disabled={disabled}
                    onClick={() => handleAction(item.id)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
