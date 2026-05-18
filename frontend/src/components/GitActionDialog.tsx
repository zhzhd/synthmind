import { useState, useEffect, useRef, useCallback } from "react";
import { useGit, type GitActionFormValues } from "../GitContext";
import {
  gitCommitStaged, gitPush, gitPull, gitMerge, gitRebase,
  gitCreateBranch, gitCreateTag, gitFetch, fetchGitBranches,
} from "../lib/api";
import type { GitBranch } from "../lib/api";

const DIALOG_TITLES: Record<string, string> = {
  commit: "Commit Changes",
  push: "Push",
  pull: "Pull",
  merge: "Merge Branch",
  rebase: "Rebase",
  newBranch: "New Branch",
  newTag: "New Tag",
  resetHead: "Reset HEAD",
  patchFile: "Show Diff for File",
};

export default function GitActionDialog() {
  const {
    dialogAction, dialogOpen, closeDialog,
    repoRoot, branch, refresh, addConsole,
    showToast, updateToast,
  } = useGit();

  const [values, setValues] = useState<GitActionFormValues>({});
  const [submitting, setSubmitting] = useState(false);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const action = dialogAction;

  // Focus first input + fetch branches for merge
  useEffect(() => {
    if (!dialogOpen) return;
    setValues({});
    setSubmitting(false);
    setBranchPickerOpen(false);
    setTimeout(() => bodyRef.current?.querySelector<HTMLInputElement>(".gd-input")?.focus(), 80);

    if (action === "merge" && repoRoot) {
      fetchGitBranches(repoRoot).then((r) => {
        setBranches(r.branches.filter((b: GitBranch) => b.name !== branch));
      }).catch(() => {});
    }
  }, [dialogOpen, action, repoRoot, branch]);

  const setVal = useCallback((key: keyof GitActionFormValues, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoRoot || !action || submitting) return;
    setSubmitting(true);

    const toastId = showToast(`Running ${action}...`, "loading");

    try {
      switch (action) {
        case "commit": {
          await gitCommitStaged(repoRoot, values.message || "", values.author || "");
          addConsole("commit", `Committed: ${values.message}`);
          break;
        }
        case "push": {
          const r = await gitPush(repoRoot, values.remote || "", values.branch || "");
          addConsole("push", r.stdout || r.stderr || "Push done");
          break;
        }
        case "pull": {
          const r = await gitPull(repoRoot, values.rebase ?? false, values.remote || "", values.branch || "");
          addConsole("pull", r.stdout || r.stderr || "Pull done");
          break;
        }
        case "fetch": {
          const r = await gitFetch(repoRoot);
          addConsole("fetch", r.stdout || r.stderr || "Fetch done");
          break;
        }
        case "merge": {
          const r = await gitMerge(repoRoot, values.branch || "");
          addConsole("merge", r.stdout || r.stderr || "Merge done");
          break;
        }
        case "rebase": {
          const r = await gitRebase(repoRoot, values.onto || "", values.branch || "");
          addConsole("rebase", r.stdout || r.stderr || "Rebase done");
          break;
        }
        case "newBranch": {
          const r = await gitCreateBranch(repoRoot, values.name || "", values.startPoint || "", true);
          addConsole("branch", r.stdout || `Created branch: ${values.name}`);
          break;
        }
        case "newTag": {
          const r = await gitCreateTag(repoRoot, values.name || "", values.message || "", values.commit || "");
          addConsole("tag", r.stdout || `Created tag: ${values.name}`);
          break;
        }
        case "resetHead": {
          addConsole("reset", `Reset HEAD (${values.mode || "mixed"}) — execute via git reset --${values.mode || "mixed"} ${values.commit || "HEAD"}`);
          break;
        }
        case "patchFile": {
          addConsole("diff", `Show diff for: ${values.file} — view in Changes panel`);
          break;
        }
      }
      updateToast(toastId, `${action} completed`, "success");
      await refresh();
      closeDialog();
    } catch (err: any) {
      updateToast(toastId, `${action} failed: ${err.message}`, "error");
    }
    setSubmitting(false);
  }, [repoRoot, action, values, submitting, showToast, updateToast, addConsole, refresh, closeDialog]);

  const handleCancel = useCallback(() => {
    if (submitting) return;
    closeDialog();
  }, [submitting, closeDialog]);

  if (!dialogOpen || !action) return null;

  // ── Render form by action type ──────────────────────────

  const renderForm = () => {
    switch (action) {
      case "commit":
        return (
          <>
            <label className="gd-label">Commit message *</label>
            <textarea
              className="gd-input gd-textarea"
              placeholder="Describe your changes..."
              value={values.message || ""}
              onChange={(e) => setVal("message", e.target.value)}
              rows={4}
              required
            />
            <label className="gd-label">Author (optional)</label>
            <input className="gd-input" placeholder="Name <email>" value={values.author || ""} onChange={(e) => setVal("author", e.target.value)} />
          </>
        );

      case "push":
        return (
          <>
            <label className="gd-label">Remote</label>
            <input className="gd-input" value={values.remote || "origin"} onChange={(e) => setVal("remote", e.target.value)} />
            <label className="gd-label">Branch</label>
            <input className="gd-input" value={values.branch || branch || ""} onChange={(e) => setVal("branch", e.target.value)} />
          </>
        );

      case "pull":
        return (
          <>
            <label className="gd-label">Remote</label>
            <input className="gd-input" value={values.remote || "origin"} onChange={(e) => setVal("remote", e.target.value)} />
            <label className="gd-label">Branch</label>
            <input className="gd-input" value={values.branch || branch || ""} onChange={(e) => setVal("branch", e.target.value)} />
            <label className="gd-checkbox">
              <input type="checkbox" checked={values.rebase ?? false} onChange={(e) => setVal("rebase", e.target.checked)} />
              Rebase instead of merge
            </label>
          </>
        );

      case "merge":
        return (
          <>
            <label className="gd-label">Branch to merge into <strong>{branch}</strong></label>
            <div className="gd-branch-picker">
              <input
                                className="gd-input"
                placeholder="Type branch name..."
                value={values.branch || ""}
                onChange={(e) => { setVal("branch", e.target.value); setBranchPickerOpen(true); }}
                onFocus={() => setBranchPickerOpen(true)}
              />
              {branchPickerOpen && branches.length > 0 && (
                <div className="gd-branch-list">
                  {branches.filter((b) => b.name.includes(values.branch || "")).map((b) => (
                    <button key={b.name} className="gd-branch-option" type="button"
                      onClick={() => { setVal("branch", b.name); setBranchPickerOpen(false); }}>
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        );

      case "rebase":
        return (
          <>
            <label className="gd-label">Onto (branch or commit)</label>
            <input className="gd-input" placeholder="main" value={values.onto || ""} onChange={(e) => setVal("onto", e.target.value)} required />
            <label className="gd-label">Branch (leave empty for current)</label>
            <input className="gd-input" value={values.branch || ""} onChange={(e) => setVal("branch", e.target.value)} />
          </>
        );

      case "newBranch":
        return (
          <>
            <label className="gd-label">Branch name *</label>
            <input className="gd-input" placeholder="feature/my-feature" value={values.name || ""} onChange={(e) => setVal("name", e.target.value)} required />
            <label className="gd-label">Start point (default: current HEAD)</label>
            <input className="gd-input" value={values.startPoint || ""} onChange={(e) => setVal("startPoint", e.target.value)} />
          </>
        );

      case "newTag":
        return (
          <>
            <label className="gd-label">Tag name *</label>
            <input className="gd-input" placeholder="v1.0.0" value={values.name || ""} onChange={(e) => setVal("name", e.target.value)} required />
            <label className="gd-label">Message (optional, for annotated tag)</label>
            <input className="gd-input" placeholder="Release notes..." value={values.message || ""} onChange={(e) => setVal("message", e.target.value)} />
            <label className="gd-label">Commit (default: HEAD)</label>
            <input className="gd-input" placeholder="HEAD" value={values.commit || ""} onChange={(e) => setVal("commit", e.target.value)} />
          </>
        );

      case "resetHead":
        return (
          <>
            <label className="gd-label">Commit reference</label>
            <input className="gd-input" value={values.commit || "HEAD"} onChange={(e) => setVal("commit", e.target.value)} />
            <label className="gd-label">Reset mode</label>
            <select className="gd-input gd-select" value={values.mode || "mixed"} onChange={(e) => setVal("mode", e.target.value)}>
              <option value="soft">Soft (keep changes staged)</option>
              <option value="mixed">Mixed (keep changes unstaged)</option>
              <option value="hard">Hard (discard all changes)</option>
            </select>
            {values.mode === "hard" && <div className="gd-warning">⚠ This will discard all uncommitted changes!</div>}
          </>
        );

      case "patchFile":
        return (
          <>
            <label className="gd-label">File path</label>
            <input className="gd-input" placeholder="src/file.ts" value={values.file || ""} onChange={(e) => setVal("file", e.target.value)} required />
          </>
        );

      default:
        return <div className="gd-empty">No form available for this action.</div>;
    }
  };

  return (
    <div className="gd-overlay" onClick={handleCancel}>
      <div className="gd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gd-header">
          <span className="gd-title">{DIALOG_TITLES[action] || action}</span>
          <button className="gd-close" onClick={handleCancel} disabled={submitting}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="gd-body" ref={bodyRef}>
            {renderForm()}
          </div>
          <div className="gd-footer">
            <button type="button" className="btn-xs" onClick={handleCancel} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn-xs btn-primary" disabled={submitting}>
              {submitting ? "Executing..." : "OK"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
