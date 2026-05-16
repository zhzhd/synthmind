import { useEffect, useState, useCallback } from "react";
import { fetchGitInfo, fetchGitStatus, fetchGitRemotes, gitPull, gitPush, gitFetch, gitStash, fetchThreadWorkdir } from "../lib/api";
import type { GitStatusEntry } from "../lib/api";
import ChangesView from "./ChangesView";
import LogView from "./LogView";
import BranchManager from "./BranchManager";
import GitConsole from "./GitConsole";

interface ConsoleEntry {
  command: string;
  output: string;
  timestamp: number;
}

interface Props {
  threadId?: string;
  repoRoot?: string;
}

export default function GitPanel({ threadId }: Props) {
  const [repoRoot, setRepoRoot] = useState("");
  const [branch, setBranch] = useState("");
  const [refType, setRefType] = useState("branch");
  const [statusEntries, setStatusEntries] = useState<GitStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"changes" | "log" | "branches">("changes");
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);

  const addConsole = useCallback((command: string, output: string) => {
    setConsoleEntries((prev) => [...prev, { command, output, timestamp: Date.now() }]);
  }, []);

  const refresh = useCallback(async () => {
    if (!repoRoot) return;
    try {
      const info = await fetchGitInfo(repoRoot);
      setBranch(info.branch || "");
      setRefType(info.ref_type || "branch");
      if (info.is_repo) {
        const status = await fetchGitStatus(repoRoot);
        setStatusEntries(status.entries);
      } else {
        setStatusEntries([]);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [repoRoot]);

  // Fetch workdir from thread
  useEffect(() => {
    if (!threadId) return;
    fetchThreadWorkdir(threadId)
      .then((r) => { if (r.workdir) setRepoRoot(r.workdir); })
      .catch(() => {});
  }, [threadId]);

  useEffect(() => {
    if (repoRoot) refresh();
  }, [repoRoot, refresh]);

  const handlePull = async () => {
    try { const r = await gitPull(repoRoot); addConsole(r.command || "pull", r.stdout || r.stderr || ""); refresh(); }
    catch (e: any) { addConsole("pull", `Error: ${e.message}`); }
  };
  const handlePush = async () => {
    try { const r = await gitPush(repoRoot); addConsole(r.command || "push", r.stdout || r.stderr || ""); refresh(); }
    catch (e: any) { addConsole("push", `Error: ${e.message}`); }
  };
  const handleFetch = async () => {
    try { const r = await gitFetch(repoRoot); addConsole(r.command || "fetch", r.stdout || r.stderr || ""); refresh(); }
    catch (e: any) { addConsole("fetch", `Error: ${e.message}`); }
  };
  const handleStash = async () => {
    try { const r = await gitStash(repoRoot, "push", "WIP"); addConsole(r.command || "stash", r.stdout || r.stderr || ""); refresh(); }
    catch (e: any) { addConsole("stash", `Error: ${e.message}`); }
  };

  const changedCount = statusEntries.length;

  if (!repoRoot) {
    return <div className="git-panel"><div className="git-empty">Set a working directory in the sidebar to use Git features.</div></div>;
  }

  return (
    <div className="git-panel">
      {/* Header */}
      <div className="git-panel-header">
        <div className="git-toolbar">
          <button className="git-branch-btn" title={branch}>
            ⎇ {branch || "(detached)"}
          </button>
          {changedCount > 0 && (
            <span className="git-changed-count" title={`${changedCount} file(s) changed`}>{changedCount} ✎</span>
          )}
          <div className="git-view-toggles">
            <button className={`git-view-btn ${view === "changes" ? "active" : ""}`} onClick={() => setView("changes")}>C</button>
            <button className={`git-view-btn ${view === "log" ? "active" : ""}`} onClick={() => setView("log")}>L</button>
            <button className={`git-view-btn ${view === "branches" ? "active" : ""}`} onClick={() => setView("branches")}>B</button>
          </div>
        </div>
        <div className="git-action-bar">
          <button className="git-action-btn" onClick={handlePull} title="Pull">↓ Pull</button>
          <button className="git-action-btn" onClick={handlePush} title="Push">↑ Push</button>
          <button className="git-action-btn" onClick={handleFetch} title="Fetch">↻ Fetch</button>
          <button className="git-action-btn" onClick={handleStash} title="Stash">⊞ Stash</button>
          <button className="git-action-btn" onClick={refresh} title="Refresh" style={{ marginLeft: "auto" }}>↺</button>
        </div>
      </div>

      {/* Content */}
      <div className="git-panel-content">
        {loading && <div className="git-panel-loading">Loading...</div>}
        {!loading && view === "changes" && (
          <ChangesView repoRoot={repoRoot} entries={statusEntries} onRefresh={refresh} onConsole={addConsole} />
        )}
        {!loading && view === "log" && <LogView repoRoot={repoRoot} />}
        {!loading && view === "branches" && (
          <BranchManager repoRoot={repoRoot} onRefresh={refresh} onConsole={addConsole} />
        )}
      </div>

      {/* Console */}
      <GitConsole
        entries={consoleEntries}
        open={consoleOpen}
        onToggle={() => setConsoleOpen(!consoleOpen)}
        onClear={() => setConsoleEntries([])}
      />
    </div>
  );
}
