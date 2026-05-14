import { useState, useEffect, useCallback, useRef } from "react";
import ChatWindow from "./components/ChatWindow";
import ModelSelector from "./components/ModelSelector";
import AgentStatus from "./components/AgentStatus";
import SettingsPanel from "./components/SettingsPanel";
import TodoPanel from "./components/TodoPanel";
import SandboxPanel from "./components/SandboxPanel";
import AgentPanel from "./components/AgentPanel";
import ThreadListPanel from "./components/ThreadListPanel";
import type { ModelConfig } from "./lib/api";

const STORAGE_KEY = "synthmind_model_config";

const DEFAULT_CONFIG: ModelConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: 0.7,
  max_tokens: 4096,
};

function loadSavedConfig(): ModelConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

export default function App() {
  const [modelConfig, setModelConfig] = useState<ModelConfig>(loadSavedConfig);
  const [agentStatus, setAgentStatus] = useState<"idle" | "thinking" | "error">("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modelConfig));
  }, [modelConfig]);

  // Refresh model list when Settings panel closes
  const prevSettingsOpen = useRef(settingsOpen);
  useEffect(() => {
    if (prevSettingsOpen.current && !settingsOpen) {
      setRefreshKey((k) => k + 1);
    }
    prevSettingsOpen.current = settingsOpen;
  }, [settingsOpen]);

  // ── Thread selection state ──
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(() => {
    try { return localStorage.getItem("synthmind_thread_id") || undefined; } catch { return undefined; }
  });
  useEffect(() => {
    if (activeThreadId) localStorage.setItem("synthmind_thread_id", activeThreadId);
    else localStorage.removeItem("synthmind_thread_id");
  }, [activeThreadId]);

  // ── Sidebar resize state ──
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("synthmind_sidebar_width");
      return saved ? parseInt(saved, 10) : 260;
    } catch { return 260; }
  });
  useEffect(() => {
    localStorage.setItem("synthmind_sidebar_width", String(sidebarWidth));
  }, [sidebarWidth]);

  const [isResizing, setIsResizing] = useState(false);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(500, Math.max(200, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>SynthMind</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AgentStatus status={agentStatus} provider={modelConfig.provider} model={modelConfig.model} />
          <button className="header-btn" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar" style={{ width: sidebarWidth }}>
          <ModelSelector key={refreshKey} config={modelConfig} onChange={setModelConfig} />
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <ThreadListPanel currentThreadId={activeThreadId} onSelectThread={setActiveThreadId} />
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <TodoPanel />
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <SandboxPanel />
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <AgentPanel />
          <div className="sidebar-resize-handle" onMouseDown={handleResizeMouseDown} />
        </aside>
        <main style={{ flex: 1, display: "flex" }}>
          <ChatWindow modelConfig={modelConfig} threadId={activeThreadId} onThreadChange={setActiveThreadId} />
        </main>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
