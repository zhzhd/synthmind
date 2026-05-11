import { useState, useEffect } from "react";
import { fetchMemories, deleteMemory, saveMemory } from "../lib/api";
import type { MemoryEntry } from "../lib/api";

const TYPE_LABELS: Record<string, string> = {
  user: "User",
  feedback: "Feedback",
  project: "Project",
  reference: "Reference",
};

const TYPE_ICONS: Record<string, string> = {
  user: "👤",
  feedback: "💡",
  project: "📋",
  reference: "🔗",
};

export default function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState<string>("user");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMemories(filter || undefined);
      setMemories(data);
    } catch (e) {
      console.error("Failed to load memories", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const handleDelete = async (id: string) => {
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error("Failed to delete memory", e);
    }
  };

  const handleSave = async () => {
    if (!newContent.trim()) return;
    try {
      await saveMemory({
        type: newType,
        content: newContent.trim(),
        tags: newTags,
      });
      setNewContent("");
      setNewTags("");
      setShowForm(false);
      load();
    } catch (e) {
      console.error("Failed to save memory", e);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const counts: Record<string, number> = {};
  for (const m of memories) {
    counts[m.type] = (counts[m.type] || 0) + 1;
  }

  return (
    <div className="sidebar-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3>Memory ({memories.length})</h3>
        <button className="btn-xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕" : "+"}
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {["", "user", "feedback", "project", "reference"].map((t) => (
          <button
            key={t}
            className={`btn-xs ${filter === t ? "active-tab" : ""}`}
            onClick={() => setFilter(t)}
            style={filter === t ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" } : undefined}
          >
            {t ? `${TYPE_ICONS[t] || ""} ${TYPE_LABELS[t] || t}` : "All"}
            {t && counts[t] ? ` (${counts[t]})` : ""}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ marginBottom: 10, padding: 8, background: "var(--surface-hover)", borderRadius: 6, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
          >
            <option value="user">User</option>
            <option value="feedback">Feedback</option>
            <option value="project">Project</option>
            <option value="reference">Reference</option>
          </select>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="What did you learn?"
            rows={3}
            style={{ fontSize: 12, padding: "6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", resize: "vertical" }}
          />
          <input
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            placeholder="tags (comma-separated)"
            style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn-xs btn-primary" onClick={handleSave}>Save</button>
            <button className="btn-xs" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="memory-list">
        {loading && <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "8px 0" }}>Loading...</div>}
        {!loading && memories.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "8px 0" }}>
            No memories yet. The agent will save observations during conversation.
          </div>
        )}
        {memories.map((m) => (
          <div key={m.id} className="memory-entry">
            <div className="memory-header">
              <span className="memory-type" title={TYPE_LABELS[m.type]}>
                {TYPE_ICONS[m.type] || "📌"}
              </span>
              <span className="memory-date">{formatTime(m.created_at)}</span>
              <span className="memory-priority">
                {"★".repeat(m.priority).padEnd(5, "☆")}
              </span>
              <button
                className="memory-delete"
                onClick={() => handleDelete(m.id)}
                title="Delete"
              >
                ✕
              </button>
            </div>
            <div className="memory-content">{m.content}</div>
            {m.tags && m.tags.length > 0 && (
              <div className="memory-tags">
                {m.tags.map((t) => (
                  <span key={t} className="memory-tag">{t}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
