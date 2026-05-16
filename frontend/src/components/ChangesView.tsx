import { useState, useCallback } from "react";
import { gitStage, gitUnstage, gitStageAll, gitUnstageAll, gitCommitStaged, gitDiscard, fetchGitStatus } from "../lib/api";
import type { GitStatusEntry } from "../lib/api";
import DiffPreview from "./DiffPreview";

const STATUS_LABELS: Record<string, string> = {
  modified: "M", added: "A", deleted: "D", untracked: "?", renamed: "R", conflicted: "!", copied: "C", changed: "~",
};

const STATUS_COLORS: Record<string, string> = {
  modified: "var(--accent-blue)", added: "var(--accent-green)", deleted: "var(--danger)",
  untracked: "var(--text-dim)", renamed: "var(--accent-blue)", conflicted: "var(--danger)",
  copied: "var(--accent-blue)", changed: "var(--accent-blue)",
};

export default function ChangesView({ repoRoot, entries, onRefresh, onConsole }: {
  repoRoot: string;
  entries: GitStatusEntry[];
  onRefresh: () => void;
  onConsole: (cmd: string, out: string) => void;
}) {
  const [commitMsg, setCommitMsg] = useState("");
  const [author, setAuthor] = useState("");
  const [committing, setCommitting] = useState(false);
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const staged = entries.filter((e) => e.staged);
  const unstaged = entries.filter((e) => !e.staged && e.status !== "untracked");
  const untracked = entries.filter((e) => e.status === "untracked");
  const conflicted = entries.filter((e) => e.status === "conflicted");

  const doAction = useCallback(async (label: string, action: () => Promise<any>) => {
    setActionLoading(label);
    try { const r = await action(); if (r?.command) onConsole(r.command, r.stdout || r.stderr || ""); }
    catch (e: any) { onConsole(label, `Error: ${e.message}`); }
    finally { setActionLoading(null); onRefresh(); }
  }, [onConsole, onRefresh]);

  const renderFileRow = (entry: GitStatusEntry, showStage = true, showUnstage = false) => {
    const isExpanded = diffFile === entry.file;
    return (
      <div key={entry.file}>
        <div className="git-change-item">
          <span className="git-status-badge" style={{ color: STATUS_COLORS[entry.status] || "var(--text-dim)" }}>
            {STATUS_LABELS[entry.status] || "?"}
          </span>
          <span
            className="git-change-file"
            onClick={() => setDiffFile(isExpanded ? null : entry.file)}
          >
            {entry.file.split("/").pop()}
          </span>
          <span className="git-change-dir">{entry.file.includes("/") ? entry.file.substring(0, entry.file.lastIndexOf("/") + 1) : ""}</span>
          <div className="git-change-actions">
            {showStage && !entry.staged && (
              <button className="btn-xs" onClick={() => doAction("stage", () => gitStage(repoRoot, [entry.file]))}
                disabled={actionLoading === "stage"}>+</button>
            )}
            {showUnstage && entry.staged && (
              <button className="btn-xs" onClick={() => doAction("unstage", () => gitUnstage(repoRoot, [entry.file]))}
                disabled={actionLoading === "unstage"}>−</button>
            )}
            {!entry.staged && entry.status !== "untracked" && (
              <button className="btn-xs btn-danger" onClick={() => doAction("discard", () => gitDiscard(repoRoot, [entry.file]))}
                disabled={actionLoading === "discard"}>✕</button>
            )}
          </div>
        </div>
        {isExpanded && (
          <DiffPreview
            repoRoot={repoRoot}
            file={entry.file}
            cached={entry.staged}
            onAction={onRefresh}
            onClose={() => setDiffFile(null)}
          />
        )}
      </div>
    );
  };

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    try {
      const r = await gitCommitStaged(repoRoot, commitMsg.trim(), author || undefined);
      if (r.command) onConsole(r.command, r.stdout || r.stderr || "");
      setCommitMsg("");
      onRefresh();
    } catch (e: any) {
      onConsole("commit", `Error: ${e.message}`);
    } finally {
      setCommitting(false);
    }
  };

  const canCommit = staged.length > 0 && commitMsg.trim().length > 0;

  return (
    <div className="git-changes">
      {/* Conflicted */}
      {conflicted.length > 0 && (
        <div className="git-changes-section">
          <div className="git-changes-header">
            <span className="git-changes-title" style={{ color: "var(--danger)" }}>Conflicted ({conflicted.length})</span>
          </div>
          {conflicted.map(renderFileRow)}
        </div>
      )}

      {/* Staged */}
      <div className="git-changes-section">
        <div className="git-changes-header">
          <span className="git-changes-title">Staged ({staged.length})</span>
          {staged.length > 0 && (
            <button className="btn-xs" onClick={() => doAction("unstage-all", () => gitUnstageAll(repoRoot))}
              disabled={actionLoading === "unstage-all"}>Unstage All</button>
          )}
        </div>
        {staged.length === 0 && <div className="git-changes-empty">No staged changes</div>}
        {staged.map((e) => renderFileRow(e, false, true))}
      </div>

      {/* Modified */}
      <div className="git-changes-section">
        <div className="git-changes-header">
          <span className="git-changes-title">Modified ({unstaged.length})</span>
          {unstaged.length > 0 && (
            <button className="btn-xs" onClick={() => doAction("stage-all", () => gitStageAll(repoRoot))}
              disabled={actionLoading === "stage-all"}>Stage All</button>
          )}
        </div>
        {unstaged.length === 0 && <div className="git-changes-empty">No modified files</div>}
        {unstaged.map((e) => renderFileRow(e, true, false))}
      </div>

      {/* Untracked */}
      <div className="git-changes-section">
        <div className="git-changes-header">
          <span className="git-changes-title">Untracked ({untracked.length})</span>
          {untracked.length > 0 && (
            <button className="btn-xs" onClick={() => doAction("stage-all", () => gitStageAll(repoRoot))}
              disabled={actionLoading === "stage-all"}>Stage All</button>
          )}
        </div>
        {untracked.length === 0 && <div className="git-changes-empty">No untracked files</div>}
        {untracked.map((e) => renderFileRow(e, true, false))}
      </div>

      {/* Commit form */}
      <div className="git-commit-form">
        <textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="Commit message"
          rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey && canCommit) handleCommit(); }}
        />
        <div className="git-commit-row-inline">
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author (optional)"
            className="git-commit-author"
          />
          <button
            className="btn-sm btn-primary"
            onClick={handleCommit}
            disabled={!canCommit || committing}
          >
            {committing ? "..." : "Commit"}
          </button>
        </div>
      </div>
    </div>
  );
}
