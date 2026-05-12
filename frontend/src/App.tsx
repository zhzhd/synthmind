import { useState, useEffect } from "react";
import ChatWindow from "./components/ChatWindow";
import ModelSelector from "./components/ModelSelector";
import AgentStatus from "./components/AgentStatus";
import SettingsPanel from "./components/SettingsPanel";
import TodoPanel from "./components/TodoPanel";
import SandboxPanel from "./components/SandboxPanel";
import MemoryPanel from "./components/MemoryPanel";
import AgentPanel from "./components/AgentPanel";
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modelConfig));
  }, [modelConfig]);

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
        <aside className="sidebar">
          <ModelSelector config={modelConfig} onChange={setModelConfig} />
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <TodoPanel />
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <MemoryPanel />
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <SandboxPanel />
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <AgentPanel />
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <MemoryPanel />
        </aside>
        <main style={{ flex: 1, display: "flex" }}>
          <ChatWindow modelConfig={modelConfig} />
        </main>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
