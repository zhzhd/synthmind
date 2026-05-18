import { useEffect } from "react";
import { GitProvider, useGit } from "../GitContext";
import ChangesView from "./ChangesView";
import GitConsole from "./GitConsole";

interface Props {
  threadId?: string;
}

export function GitPanelContent() {
  const {
    repoRoot, branch, loading, consoleEntries,
    consoleOpen, setConsoleOpen, clearConsole, refresh,
  } = useGit();

  // Refresh git status whenever the panel mounts (e.g. tab switch)
  useEffect(() => { refresh(); }, []);

  const changedCount = useGit().statusEntries.length;

  if (!repoRoot) {
    return <div className="git-panel"><div className="git-empty">Set a working directory in the sidebar to use Git features.</div></div>;
  }

  return (
    <div className="git-panel">
      {/* Header — branch + count only */}
      <div className="git-panel-header">
        <div className="git-toolbar">
          <button className="git-branch-btn" title={branch}>
            ⎇ {branch || "(detached)"}
          </button>
          {changedCount > 0 && (
            <span className="git-changed-count" title={`${changedCount} file(s) changed`}>{changedCount} ✎</span>
          )}
        </div>
      </div>

      {/* Content — always ChangesView */}
      <div className="git-panel-content">
        {loading && <div className="git-panel-loading">Loading...</div>}
        {!loading && <ChangesView />}
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
