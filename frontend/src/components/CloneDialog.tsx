import { useState } from "react";
import { gitClone, setThreadWorkdir } from "../lib/api";

interface Props {
  threadId?: string;
  onClose: () => void;
  onCloned: (path: string) => void;
}

export default function CloneDialog({ threadId, onClose, onCloned }: Props) {
  const [url, setUrl] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [branch, setBranch] = useState("");
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog((prev) => [...prev, msg]);

  const handleClone = async () => {
    if (!url.trim()) return;
    setError("");
    setCloning(true);
    addLog(`Cloning ${url.trim()}...`);
    try {
      const result = await gitClone(url.trim(), targetDir.trim(), branch.trim());
      addLog(`Cloned to ${result.cloned_path}`);
      // Update thread workdir to the cloned repo
      if (threadId) {
        await setThreadWorkdir(threadId, result.cloned_path);
        addLog("Thread workdir updated");
      }
      onCloned(result.cloned_path);
    } catch (e: any) {
      setError(e.message);
      addLog(`Error: ${e.message}`);
    } finally {
      setCloning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !cloning && url.trim()) {
      handleClone();
    }
    if (e.key === "Escape" && !cloning) {
      onClose();
    }
  };

  return (
    <div className="clone-overlay" onKeyDown={handleKeyDown}>
      <div className="clone-dialog">
        <div className="clone-dialog-header">
          <span>Clone Repository</span>
          <button className="btn-xs" onClick={onClose}>✕</button>
        </div>
        <div className="clone-dialog-body">
          <div className="clone-field">
            <label className="clone-label">Repository URL</label>
            <input
              type="text"
              className="clone-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              autoFocus
              disabled={cloning}
            />
          </div>
          <div className="clone-field">
            <label className="clone-label">Target Directory</label>
            <input
              type="text"
              className="clone-input"
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              placeholder={url ? `/path/to/${url.split("/").pop()?.replace(".git", "") || "repo"}` : "(auto)"}
              disabled={cloning}
            />
          </div>
          <div className="clone-field">
            <label className="clone-label">Branch (optional)</label>
            <input
              type="text"
              className="clone-input"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              disabled={cloning}
            />
          </div>

          {error && <div className="clone-error">{error}</div>}

          {log.length > 0 && (
            <div className="clone-log">
              {log.map((msg, i) => (
                <div key={i} className="clone-log-line">{msg}</div>
              ))}
            </div>
          )}
        </div>
        <div className="clone-dialog-footer">
          <button className="btn-sm" onClick={onClose} disabled={cloning}>Cancel</button>
          <button
            className="btn-sm btn-primary"
            onClick={handleClone}
            disabled={cloning || !url.trim()}
          >
            {cloning ? "Cloning..." : "Clone"}
          </button>
        </div>
      </div>
    </div>
  );
}
