import { useEffect, useState } from "react";
import { fetchThreads, fetchThreadWorkdir, setThreadWorkdir, pickFolder } from "../lib/api";
import type { ThreadInfo } from "../lib/api";

interface Props {
  currentThreadId: string | undefined;
  onSelectThread: (threadId: string | undefined) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ThreadListPanel({ currentThreadId, onSelectThread }: Props) {
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Workdir state ──
  const [workdir, setWorkdir] = useState<string | null>(null);
  const [editingWorkdir, setEditingWorkdir] = useState(false);
  const [workdirInput, setWorkdirInput] = useState("");
  const [savingWorkdir, setSavingWorkdir] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchThreads();
      setThreads(data);
    } catch (e) {
      console.error("Failed to load threads", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  // Load workdir when active thread changes
  useEffect(() => {
    if (!currentThreadId) {
      setWorkdir(null);
      setEditingWorkdir(false);
      return;
    }
    setEditingWorkdir(false);
    fetchThreadWorkdir(currentThreadId)
      .then((r) => setWorkdir(r.workdir || null))
      .catch(() => setWorkdir(null));
  }, [currentThreadId]);

  const handleNew = () => {
    onSelectThread(undefined);
  };

  const handleBrowseFolder = async () => {
    // Use the backend to open a native OS folder picker dialog
    try {
      const path = await pickFolder();
      if (path) {
        setWorkdirInput(path);
      }
    } catch {
      // ignore — backend endpoint may not be available
    }
  };

  const handleSaveWorkdir = async () => {
    if (!currentThreadId) return;
    setSavingWorkdir(true);
    try {
      await setThreadWorkdir(currentThreadId, workdirInput);
      setWorkdir(workdirInput);
      setEditingWorkdir(false);
    } catch (e) {
      console.error("Failed to save workdir", e);
    } finally {
      setSavingWorkdir(false);
    }
  };

  const handleCancelWorkdir = () => {
    setEditingWorkdir(false);
    setWorkdirInput(workdir || "");
  };

  const handleClearWorkdir = async () => {
    if (!currentThreadId) return;
    setSavingWorkdir(true);
    try {
      await setThreadWorkdir(currentThreadId, "");
      setWorkdir(null);
      setEditingWorkdir(false);
    } catch (e) {
      console.error("Failed to clear workdir", e);
    } finally {
      setSavingWorkdir(false);
    }
  };

  return (
    <div className="sidebar-section">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h3>Conversations ({threads.length})</h3>
        <button className="btn-xs" onClick={handleNew} title="New conversation">
          + New
        </button>
      </div>

      <div className="thread-list">
        {loading && threads.length === 0 && (
          <div className="thread-empty">Loading...</div>
        )}
        {!loading && threads.length === 0 && (
          <div className="thread-empty">No conversations yet. Start chatting!</div>
        )}
        {threads.map((t) => (
          <div
            key={t.thread_id}
            className={`thread-item${t.thread_id === currentThreadId ? " active" : ""}`}
            onClick={() => onSelectThread(t.thread_id)}
          >
            <div className="thread-item-preview">{t.preview}</div>
            <div className="thread-item-meta">
              <span>{t.message_count} msgs</span>
              <span>{formatTime(t.updated_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Per-thread working directory ── */}
      {currentThreadId && (
        <div style={{ marginTop: 12, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)" }}>
              Working Directory
            </span>
            {!editingWorkdir && (
              <button className="btn-xs" onClick={() => { setWorkdirInput(workdir || ""); setEditingWorkdir(true); }} title="Edit workdir">
                {workdir ? "Edit" : "Set"}
              </button>
            )}
          </div>

          {editingWorkdir ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", gap: 4 }}>
                <input
                  type="text"
                  value={workdirInput}
                  onChange={(e) => setWorkdirInput(e.target.value)}
                  placeholder="/path/to/project"
                  style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", flex: 1, minWidth: 0 }}
                  autoFocus
                />
                <button className="btn-xs" onClick={handleBrowseFolder} title="Browse folders">📁</button>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn-xs btn-primary" onClick={handleSaveWorkdir} disabled={savingWorkdir}>
                  {savingWorkdir ? "Saving..." : "Save"}
                </button>
                <button className="btn-xs" onClick={handleCancelWorkdir}>Cancel</button>
                {workdir && <button className="btn-xs" onClick={handleClearWorkdir} style={{ marginLeft: "auto" }}>Clear</button>}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: workdir ? "var(--text)" : "var(--text-dim)", fontFamily: "monospace", wordBreak: "break-all", padding: "2px 0" }}>
              {workdir || "(none — uses temp directory)"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
