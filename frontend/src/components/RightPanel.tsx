import { useTranslation } from "../useLanguage";
import SandboxPanel from "./SandboxPanel";
import AgentPanel from "./AgentPanel";
import TracesTab from "./TracesTab";
import FilesPanel from "./FilesPanel";
import { GitPanelContent } from "./GitPanel";

export type TabId = "files" | "git" | "sandbox" | "agents" | "traces";

const TABS: { id: TabId; labelKey: string; icon: string }[] = [
  { id: "files", labelKey: "panel.files", icon: "📁" },
  { id: "git", labelKey: "panel.git", icon: "⎇" },
  { id: "sandbox", labelKey: "panel.sandbox", icon: "🔧" },
  { id: "agents", labelKey: "panel.agents", icon: "🤖" },
  { id: "traces", labelKey: "panel.traces", icon: "📊" },
];

interface Props {
  activeThreadId?: string;
  activeTab?: TabId;
  onTabChange?: (tab: TabId) => void;
}

export default function RightPanel({ activeThreadId, activeTab: externalTab, onTabChange }: Props) {
  const { t } = useTranslation();
  const activeTab = externalTab ?? "git";

  return (
    <div className="right-panel">
      <div className="right-panel-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`right-panel-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onTabChange?.(tab.id)}
          >
            <span className="right-panel-tab-icon">{tab.icon}</span>
            <span className="right-panel-tab-label">{t(tab.labelKey)}</span>
          </button>
        ))}
      </div>
      <div className="right-panel-content">
        {activeTab === "files" && <FilesPanel threadId={activeThreadId} />}
        {activeTab === "git" && <GitPanelContent />}
        {activeTab === "sandbox" && <SandboxPanel />}
        {activeTab === "agents" && <AgentPanel />}
        {activeTab === "traces" && <TracesTab />}
      </div>
    </div>
  );
}
