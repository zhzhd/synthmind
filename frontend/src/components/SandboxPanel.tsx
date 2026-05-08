import { useEffect, useRef, useState } from "react";

interface SandboxEntry {
  id: string;
  type: "command" | "python";
  code: string;
  output: string;
  timestamp: number;
}

const API_BASE = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? "http://127.0.0.1:8000" : "";

export default function SandboxPanel() {
  const [collapsed, setCollapsed] = useState(true);
  const [entries, setEntries] = useState<SandboxEntry[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [entries]);

  // Poll for sandbox execution history (only when expanded)
  useEffect(() => {
    if (collapsed) return;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sandbox`);
        if (res.ok) setEntries((await res.json()).entries || []);
      } catch {}
    };
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [collapsed]);

  return (
    <div className="sidebar-section">
      <div className="settings-list-header" style={{ cursor: "pointer" }} onClick={() => setCollapsed(!collapsed)}>
        <h3>Sandbox</h3>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{collapsed ? "▶" : "▼"}</span>
      </div>

      {!collapsed && (
        <div className="sandbox-list">
          {entries.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>
              No executions yet. Ask the agent to run code.
            </p>
          )}
          {entries.map((e) => (
            <div key={e.id} className="sandbox-entry">
              <div className="sandbox-header">
                <span className="sandbox-type">{e.type === "command" ? "💻" : "🐍"}</span>
                <code className="sandbox-code">{e.code.slice(0, 80)}{e.code.length > 80 ? "..." : ""}</code>
              </div>
              {e.output && (
                <pre className="sandbox-output">{e.output.slice(0, 300)}{e.output.length > 300 ? "..." : ""}</pre>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
