import { useState, useEffect, useCallback, useRef } from "react";
import ChatWindow from "./components/ChatWindow";
import ModelSelector from "./components/ModelSelector";
import AgentStatus from "./components/AgentStatus";
import SettingsPanel from "./components/SettingsPanel";
import TodoPanel from "./components/TodoPanel";
import ThreadListPanel from "./components/ThreadListPanel";
import RightPanel from "./components/RightPanel";
import BalanceDisplay from "./components/BalanceDisplay";
import CloneDialog from "./components/CloneDialog";
import GitDropdown from "./components/GitDropdown";
import GitToast from "./components/GitToast";
import GitActionDialog from "./components/GitActionDialog";
import { GitProvider } from "./GitContext";
import type { ModelConfig } from "./lib/api";
import type { TabId } from "./components/RightPanel";

const STORAGE_KEY = "synthmind_model_config";

const DEFAULT_CONFIG: ModelConfig = {
  provider: "deepseek",
  model: "deepseek-v4-flash",
  temperature: 0.7,
  max_tokens: 4096,
  reasoning_effort: "high",
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
  const [_agentStatus] = useState<"idle" | "thinking" | "error">("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
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
  const [isRightResizing, setIsRightResizing] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("synthmind_right_panel_width");
      return saved ? parseInt(saved, 10) : 340;
    } catch { return 340; }
  });
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<TabId>("git");

  useEffect(() => {
    localStorage.setItem("synthmind_right_panel_width", String(rightPanelWidth));
  }, [rightPanelWidth]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleRightResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsRightResizing(true);
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

  useEffect(() => {
    if (!isRightResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(600, Math.max(280, window.innerWidth - e.clientX));
      setRightPanelWidth(newWidth);
    };
    const handleMouseUp = () => setIsRightResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isRightResizing]);

  const handleGitNavigate = useCallback((_tab: string, _gitView?: string) => {
    setRightPanelTab(_tab as TabId);
    setRightPanelOpen(true);
  }, []);

  return (
    <GitProvider threadId={activeThreadId}>
      <div className="app">
        <header className="app-header">
          <h1>SynthMind</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AgentStatus status={_agentStatus} provider={modelConfig.provider} model={modelConfig.model} />
            <GitDropdown onNavigate={handleGitNavigate} onOpenClone={() => setCloneOpen(true)} />
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
            <div style={{ flex: 1 }} />
            <BalanceDisplay />
            <div className="sidebar-resize-handle" onMouseDown={handleResizeMouseDown} />
          </aside>
          <main className="main-area">
            <ChatWindow modelConfig={modelConfig} threadId={activeThreadId} onThreadChange={setActiveThreadId} />
          </main>
          {rightPanelOpen && (
            <>
              <div className="right-panel-resize-handle" onMouseDown={handleRightResizeMouseDown} />
              <div className="right-panel-wrapper" style={{ width: rightPanelWidth }}>
                <RightPanel activeThreadId={activeThreadId} activeTab={rightPanelTab} onTabChange={setRightPanelTab} />
              </div>
            </>
          )}
          <button
            className="right-panel-toggle"
            style={rightPanelOpen ? { right: `${rightPanelWidth + 4}px` } : undefined}
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            title={rightPanelOpen ? "Close right panel" : "Open right panel"}
          >
            {rightPanelOpen ? "▶" : "◀"}
          </button>
        </div>

        {cloneOpen && (
          <CloneDialog
            threadId={activeThreadId}
            onClose={() => setCloneOpen(false)}
            onCloned={(_path) => {
              setCloneOpen(false);
              setRefreshKey((k) => k + 1);
            }}
          />
        )}
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>

      <GitToast />
      <GitActionDialog />
    </GitProvider>
  );
}
