import { GitProvider, useGit } from "../GitContext";
import ChangesView from "./ChangesView";
import LogView from "./LogView";
import BranchManager from "./BranchManager";
import GitConsole from "./GitConsole";

interface Props {
  threadId?: string;
}

function GitPanelContent() {
  const {
    repoRoot, branch, loading, consoleEntries, refresh,
    handlePull, handlePush, handleFetch, handleStash,
    view, setView, consoleOpen, setConsoleOpen, clearConsole,
  } = useGit();

  const changedCount = useGit().statusEntries.length;

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
        {!loading && view === "changes" && <ChangesView />}
        {!loading && view === "log" && <LogView />}
        {!loading && view === "branches" && <BranchManager />}
      </div>

      {/* Console */}
      <GitConsole
        entries={consoleEntries}
        open={consoleOpen}
        onToggle={() => setConsoleOpen(!consoleOpen)}
        onClear={clearConsole}
      />
    </div>
  );
}

export default function GitPanel({ threadId }: Props) {
  return (
    <GitProvider threadId={threadId}>
      <GitPanelContent />
    </GitProvider>
  );
}
