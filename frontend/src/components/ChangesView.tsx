import { useState, useCallback, useEffect } from "react";
import { gitStage, gitUnstage, gitStageAll, gitUnstageAll, gitCommitStaged, gitDiscard, gitStashList, gitStash, fetchGitConflicts, gitResolveConflict } from "../lib/api";
import type { GitStatusEntry, ConflictFile } from "../lib/api";
import { useGit } from "../GitContext";
import DiffPreview from "./DiffPreview";
import ConflictMergeView from "./ConflictMergeView";

const STATUS_LABELS: Record<string, string> = {
  modified: "M", added: "A", deleted: "D", untracked: "?", renamed: "R", conflicted: "!", copied: "C", changed: "~",
};

const STATUS_COLORS: Record<string, string> = {
  modified: "var(--accent-blue)", added: "var(--accent-green)", deleted: "var(--danger)",
  untracked: "var(--text-dim)", renamed: "var(--accent-blue)", conflicted: "var(--danger)",
  copied: "var(--accent-blue)", changed: "var(--accent-blue)",
};

export default function ChangesView() {
  const { repoRoot, statusEntries: entries, refresh, addConsole } = useGit();
  const [commitMsg, setCommitMsg] = useState("");
  const [author, setAuthor] = useState("");
  const [committing, setCommitting] = useState(false);
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [stashOpen, setStashOpen] = useState(false);
  const [stashList, setStashList] = useState<{ index: number; branch: string; message: string }[]>([]);
  const [loadingStash, setLoadingStash] = useState(false);
  const [conflictData, setConflictData] = useState<ConflictFile[]>([]);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  // Fetch stash list when stash section is opened
  useEffect(() => {
    if (!stashOpen) return;
    setLoadingStash(true);
    gitStashList(repoRoot)
      .then((r) => {
        const stashes: { index: number; branch: string; message: string }[] = [];
        if (r.stdout) {
          for (const line of r.stdout.trim().split("\n")) {
            if (!line.trim()) continue;
            // Parse: "stash@{0}: On branch: message"
            const match = line.match(/^stash@\{(\d+)\}:\s+(.+)$/);
            if (match) {
              const idx = parseInt(match[1]);
              const rest = match[2];
              const branchMatch = rest.match(/^(?:On\s+)?([^:]+):\s*(.*)/);
              stashes.push({
                index: idx,
                branch: branchMatch ? branchMatch[1] : "",
                message: branchMatch ? branchMatch[2] : rest,
              });
            }
          }
        }
        setStashList(stashes);
      })
      .catch(() => setStashList([]))
      .finally(() => setLoadingStash(false));
  }, [stashOpen, repoRoot]);

  const handleStashAction = async (action: "pop" | "apply" | "drop", index: number) => {
    try {
      const r = await gitStash(repoRoot, action, "", index);
      addConsole(`stash ${action}`, r.stdout || r.stderr || "");
      refresh();
      // Refresh stash list
      setTimeout(() => {
        gitStashList(repoRoot).then((r2) => {
          const stashes: { index: number; branch: string; message: string }[] = [];
          if (r2.stdout) {
            for (const line of r2.stdout.trim().split("\n")) {
              if (!line.trim()) continue;
              const match = line.match(/^stash@\{(\d+)\}:\s+(.+)$/);
              if (match) {
                const idx = parseInt(match[1]);
                const rest = match[2];
                const branchMatch = rest.match(/^(?:On\s+)?([^:]+):\s*(.*)/);
                stashes.push({ index: idx, branch: branchMatch ? branchMatch[1] : "", message: branchMatch ? branchMatch[2] : rest });
              }
            }
          }
          setStashList(stashes);
        }).catch(() => {});
      }, 500);
    } catch (e: any) {
      addConsole(`stash ${action}`, `Error: ${e.message}`);
    }
  };

  const staged = entries.filter((e) => e.staged);
  const unstaged = entries.filter((e) => !e.staged && e.status !== "untracked");
  const untracked = entries.filter((e) => e.status === "untracked");
  const conflicted = entries.filter((e) => e.status === "conflicted");

  // Fetch conflict details when conflicted files exist
  useEffect(() => {
    if (conflicted.length > 0) {
      setLoadingConflicts(true);
      fetchGitConflicts(repoRoot)
        .then((r) => setConflictData(r.conflicted || []))
        .catch(() => setConflictData([]))
        .finally(() => setLoadingConflicts(false));
    } else {
      setConflictData([]);
    }
  }, [conflicted.length, repoRoot]);

  const handleConflictResolve = async (file: string, strategy: "ours" | "theirs" | "manual", manualContentStr?: string) => {
    setResolving(file);
    try {
      const content = strategy === "manual" ? (manualContentStr || "") : "";
      await gitResolveConflict(repoRoot, file, strategy, content);
      addConsole("resolve", `Resolved ${file} (${strategy})`);
      setConflictData((prev) => prev.filter((c) => c.file !== file));
      refresh();
    } catch (e: any) {
      addConsole("resolve", `Error: ${e.message}`);
    } finally {
      setResolving(null);
    }
  };

  const doAction = useCallback(async (label: string, action: () => Promise<any>) => {
    setActionLoading(label);
    try { const r = await action(); if (r?.command) addConsole(r.command, r.stdout || r.stderr || ""); }
    catch (e: any) { addConsole(label, `Error: ${e.message}`); }
    finally { setActionLoading(null); refresh(); }
  }, [addConsole, refresh]);

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
      if (r.command) addConsole(r.command, r.stdout || r.stderr || "");
      setCommitMsg("");
      refresh();
    } catch (e: any) {
      addConsole("commit", `Error: ${e.message}`);
    } finally {
      setCommitting(false);
    }
  };

  const canCommit = staged.length > 0 && commitMsg.trim().length > 0;

  return (
    <div className="git-changes">
      {/* Conflicted — three-pane merge view */}
      {conflicted.length > 0 && (
        <div className="git-conflict-section">
          <div className="git-changes-header">
            <span className="git-changes-title" style={{ color: "var(--danger)" }}>⚡ Conflicts ({conflicted.length})</span>
          </div>
          {loadingConflicts && <div className="git-conflict-loading" style={{ padding: "6px 8px", color: "var(--text-dim)", fontSize: 11 }}>Analyzing conflicts...</div>}
          {!loadingConflicts && conflictData.map((cf) => (
            <ConflictMergeView
              key={cf.file}
              conflict={cf}
              resolving={resolving === cf.file}
              onResolve={(strategy, content) => {
                if (strategy === "ours") {
                  handleConflictResolve(cf.file, "ours");
                } else if (strategy === "theirs") {
                  handleConflictResolve(cf.file, "theirs");
                } else if (content !== undefined) {
                  handleConflictResolve(cf.file, "manual", content);
                }
              }}
            />
          ))}
          {!loadingConflicts && conflictData.length === 0 && conflicted.length > 0 && (
            <div className="git-conflict-simple">
              {conflicted.map((e) => renderFileRow(e))}
            </div>
          )}
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

      {/* Stash list */}
      <div className="git-stash-section">
        <button className="git-stash-toggle" onClick={() => setStashOpen(!stashOpen)}>
          <span>{stashOpen ? "▼" : "▶"} Stashes ({stashList.length})</span>
        </button>
        {stashOpen && (
          <div className="git-stash-list">
            {loadingStash && <div className="git-stash-item" style={{ color: "var(--text-dim)" }}>Loading...</div>}
            {!loadingStash && stashList.length === 0 && (
              <div className="git-stash-item" style={{ color: "var(--text-dim)" }}>No stashes</div>
            )}
            {stashList.map((s) => (
              <div key={s.index} className="git-stash-item">
                <span className="git-stash-msg">{s.message || "(no message)"}</span>
                <span className="git-stash-meta">{s.branch} @ stash@{s.index}</span>
                <div className="git-stash-actions">
                  <button className="btn-xs" onClick={() => handleStashAction("apply", s.index)} title="Apply">▶</button>
                  <button className="btn-xs" onClick={() => handleStashAction("pop", s.index)} title="Pop (apply & drop)">▼</button>
                  <button className="btn-xs btn-danger" onClick={() => handleStashAction("drop", s.index)} title="Drop">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
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
