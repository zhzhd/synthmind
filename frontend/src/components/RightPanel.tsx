import { useState } from "react";
import SandboxPanel from "./SandboxPanel";
import AgentPanel from "./AgentPanel";
import TracesTab from "./TracesTab";

type TabId = "sandbox" | "agents" | "traces";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "sandbox", label: "Sandbox", icon: "🔧" },
  { id: "agents", label: "Agents", icon: "🤖" },
  { id: "traces", label: "Traces", icon: "📊" },
];

export default function RightPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("sandbox");

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
        {activeTab === "sandbox" && <SandboxPanel />}
        {activeTab === "agents" && <AgentPanel />}
        {activeTab === "traces" && <TracesTab />}
      </div>
    </div>
  );
}
