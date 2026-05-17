import { useEffect, useState } from "react";
import { fetchGitLogDetail, gitCherryPick, gitRevert } from "../lib/api";
import type { GitLogEntry } from "../lib/api";
import { useGit } from "../GitContext";
import InteractiveRebase from "./InteractiveRebase";

export default function LogView() {
  const { repoRoot, refresh, addConsole } = useGit();
  const [entries, setEntries] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showRebase, setShowRebase] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: "cherry-pick" | "revert"; hash: string; msg: string } | null>(null);

  const load = async (reset = false) => {
    setLoading(true);
    try {
      const s = reset ? 0 : skip;
      const data = await fetchGitLogDetail(repoRoot, 20, s);
      if (reset) {
        setEntries(data.commits);
      } else {
        setEntries((prev) => [...prev, ...data.commits]);
      }
      setSkip(s + data.commits.length);
      setHasMore(data.commits.length >= 20);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(true); }, [repoRoot]);

  const handleCherryPick = async (hash: string) => {
    try {
      await gitCherryPick(repoRoot, [hash]);
      addConsole("cherry-pick", `Cherry-picked ${hash}`);
      setConfirmAction(null);
      setExpanded(null);
      refresh();
    } catch (e: any) { addConsole("cherry-pick", `Error: ${e.message}`); }
  };

  const handleRevert = async (hash: string) => {
    try {
      await gitRevert(repoRoot, hash);
      addConsole("revert", `Reverted ${hash}`);
      setConfirmAction(null);
      setExpanded(null);
      refresh();
    } catch (e: any) { addConsole("revert", `Error: ${e.message}`); }
  };

  return (
    <div className="git-log-view">
      {showRebase && (
        <InteractiveRebase onClose={() => { setShowRebase(false); load(true); }} />
      )}
      {!showRebase && (
        <>
      <div className="git-log-toolbar">
        <button className="btn-sm" onClick={() => setShowRebase(true)} title="Interactive rebase onto another branch">Rebase onto...</button>
      </div>
      <div className="git-log-list">
        {entries.map((c, idx) => {
          const isExpanded = expanded === c.hash;
          const isConfirming = confirmAction && confirmAction.hash === c.hash;
          const colors = ["var(--accent-green)", "var(--accent-blue)", "var(--primary)", "var(--danger)", "var(--text)"];
          const branchColor = colors[idx % colors.length];
          return (
            <div key={c.hash}>
              <div className="git-log-item" onClick={() => setExpanded(isExpanded ? null : c.hash)}>
                <span className="git-log-graph" style={{ color: branchColor }}>{c.graph_line}</span>
                <span className="git-log-hash">{c.hash}</span>
                <span className="git-log-msg">{c.message}</span>
                <span className="git-log-time">{c.time}</span>
              </div>
              {isExpanded && !isConfirming && (
                <div className="git-log-detail">
                  <div className="git-log-detail-row"><strong>Author:</strong> {c.author}</div>
                  <div className="git-log-detail-row"><strong>Hash:</strong> {c.hash_full}</div>
                  {c.refs && <div className="git-log-detail-row"><strong>Refs:</strong> <span className="git-log-refs">{c.refs}</span></div>}
                  <div className="git-log-actions">
                    <button className="btn-xs" onClick={() => setConfirmAction({ type: "cherry-pick", hash: c.hash_full, msg: c.message })}>Cherry-pick</button>
                    <button className="btn-xs" onClick={() => setConfirmAction({ type: "revert", hash: c.hash_full, msg: c.message })}>Revert</button>
                  </div>
                </div>
              )}
              {isConfirming && (
                <div className="git-log-confirm">
                  {confirmAction!.type === "cherry-pick" ? "Cherry-pick" : "Revert"} commit <strong>{confirmAction!.hash.substring(0, 7)}</strong>?
                  <div className="git-log-confirm-msg" title={confirmAction!.msg}>{confirmAction!.msg.substring(0, 60)}</div>
                  <div className="git-log-confirm-actions">
                    <button className="btn-xs btn-primary" onClick={() => confirmAction!.type === "cherry-pick" ? handleCherryPick(confirmAction!.hash) : handleRevert(confirmAction!.hash)}>Confirm</button>
                    <button className="btn-xs" onClick={() => setConfirmAction(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {loading && <div className="git-log-loading">Loading...</div>}
        {!loading && hasMore && (
          <button className="btn-sm git-log-more" onClick={() => load()}>Load more</button>
        )}
      </div>
        </>
      )}
    </div>
  );
}
