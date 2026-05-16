import { useState } from "react";
import SandboxPanel from "./SandboxPanel";
import AgentPanel from "./AgentPanel";
import TracesTab from "./TracesTab";
import FilesPanel from "./FilesPanel";
import GitPanel from "./GitPanel";

type TabId = "files" | "git" | "sandbox" | "agents" | "traces";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "files", label: "Files", icon: "📁" },
  { id: "git", label: "Changes", icon: "⎇" },
  { id: "sandbox", label: "Sandbox", icon: "🔧" },
  { id: "agents", label: "Agents", icon: "🤖" },
  { id: "traces", label: "Traces", icon: "📊" },
];

export default function RightPanel({ activeThreadId }: { activeThreadId?: string }) {
  const [activeTab, setActiveTab] = useState<TabId>("git");

  return (
    <div className="right-panel">
      <div className="right-panel-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`right-panel-tab ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="right-panel-tab-icon">{t.icon}</span>
            <span className="right-panel-tab-label">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="right-panel-content">
        {activeTab === "files" && <FilesPanel threadId={activeThreadId} />}
        {activeTab === "git" && <GitPanel threadId={activeThreadId} />}
        {activeTab === "sandbox" && <SandboxPanel />}
        {activeTab === "agents" && <AgentPanel />}
        {activeTab === "traces" && <TracesTab />}
      </div>
    </div>
  );
}
