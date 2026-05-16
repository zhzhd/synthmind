import { useEffect, useState } from "react";
import type { TraceEntry } from "../lib/api";
import { fetchTraces } from "../lib/api";

const TRACE_ICONS: Record<string, string> = {
  llm: "🧠",
  tool: "🔧",
  error: "❌",
};

const TRACE_TYPE_LABELS: Record<string, string> = {
  llm: "LLM Call",
  tool: "Tool Call",
  error: "Error",
};

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTraceTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function TracesTab() {
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "llm" | "tool" | "error">("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTraces();
      setTraces(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load traces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = filter === "all" ? traces : traces.filter((t) => t.type === filter);

  return (
    <div className="right-panel-tab-content">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 className="right-panel-tab-heading">Traces ({traces.length})</h3>
        <button className="btn-sm" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {(["all", "llm", "tool", "error"] as const).map((t) => (
          <button
            key={t}
            className={`btn-xs ${filter === t ? "active-tab" : ""}`}
            onClick={() => setFilter(t)}
            style={filter === t ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" } : undefined}
          >
            {t === "all" ? "All" : `${TRACE_ICONS[t] || ""} ${TRACE_TYPE_LABELS[t] || t}`}
            {t !== "all" ? ` (${traces.filter((x) => x.type === t).length})` : ""}
          </button>
        ))}
      </div>

      {error && (
        <div className="test-result error" style={{ marginBottom: 8 }}>{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", padding: "16px 0" }}>
          {traces.length === 0
            ? "No traces yet. Send a message to the agent to see traces appear here."
            : "No traces match the current filter."}
        </p>
      )}

      <div className="traces-list">
        {filtered.map((t) => {
          const isExpanded = expanded.has(t.id);
          return (
            <div
              key={t.id}
              className={`trace-entry ${t.type} ${isExpanded ? "expanded" : ""}`}
              onClick={() => toggleExpand(t.id)}
            >
              <div className="trace-header">
                <span className="trace-icon" title={TRACE_TYPE_LABELS[t.type]}>
                  {t.type === "error" ? "❌" : t.type === "llm" ? "🧠" : "🔧"}
                </span>
                <span className="trace-name">{t.name || t.type}</span>
                <span className="trace-latency">{formatLatency(t.latency_ms)}</span>
                <span className="trace-time">{formatTraceTime(t.timestamp)}</span>
              </div>

              {isExpanded && (
                <div className="trace-details">
                  {t.input_preview && (
                    <div className="trace-detail-section">
                      <span className="trace-detail-label">Input</span>
                      <div className="trace-detail-value">{t.input_preview}</div>
                    </div>
                  )}
                  {t.output_preview && (
                    <div className="trace-detail-section">
                      <span className="trace-detail-label">Output</span>
                      <div className="trace-detail-value">{t.output_preview}</div>
                    </div>
                  )}
                  {t.type === "llm" && Object.keys(t.token_usage).length > 0 && (
                    <div className="trace-detail-section">
                      <span className="trace-detail-label">Tokens</span>
                      <div className="trace-tokens">
                        {Object.entries(t.token_usage).map(([k, v]) => (
                          <span key={k} className="trace-token-badge">{k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {t.error && (
                    <div className="trace-detail-section">
                      <span className="trace-detail-label">Error</span>
                      <div className="trace-detail-value trace-error">{t.error}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
