import { useState, useEffect } from "react";
import { fetchAgents, fetchAgentDetail, deleteAgent, runAgent } from "../lib/api";
import type { AgentInfo, AgentDetail } from "../lib/api";
import AgentDetailModal from "./AgentDetailModal";

function AgentCard({
  agent,
  onDetail,
  onDelete,
}: {
  agent: AgentInfo;
  onDetail: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="agent-card">
      <div className="agent-card-header">
        <strong>{agent.name}</strong>
        <span className="agent-card-model">{agent.model_provider}/{agent.model}</span>
      </div>
      <div className="agent-card-desc">{agent.description}</div>
      <div className="agent-card-meta">
        <span className="agent-card-tools">{agent.tools.length} tools</span>
      </div>
      <div className="agent-card-actions">
        <button className="btn-xs" onClick={onDetail}>Detail</button>
        <button className="btn-xs btn-danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

export default function AgentPanel() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [detailAgent, setDetailAgent] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAgents();
      setAgents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDetail = async (name: string) => {
    setDetailLoading(true);
    try {
      const detail = await fetchAgentDetail(name);
      setDetailAgent(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agent detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteAgent(name);
      setAgents((prev) => prev.filter((a) => a.name !== name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete agent");
    }
  };

  return (
    <div className="right-panel-tab-content">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 className="right-panel-tab-heading">Agents ({agents.length})</h3>
        <button className="btn-xs" onClick={load} disabled={loading} title="Refresh">
          ↻
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: "var(--danger)", padding: "4px 0", marginBottom: 4 }}>
          {error}
          <button className="btn-xs" style={{ marginLeft: 6 }} onClick={load}>Retry</button>
        </div>
      )}

      {loading && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "8px 0" }}>Loading agents...</div>
      )}

      {!loading && agents.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "8px 0" }}>
          No sub-agents defined. Create agent files in backend/.agents/.
        </div>
      )}

      <div className="agent-list">
        {agents.map((a) => (
          <AgentCard
            key={a.name}
            agent={a}
            onDetail={() => handleDetail(a.name)}
            onDelete={() => handleDelete(a.name)}
          />
        ))}
      </div>

      {detailLoading && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "8px 0" }}>Loading detail...</div>
      )}

      {detailAgent && (
        <AgentDetailModal
          agent={detailAgent}
          onClose={() => setDetailAgent(null)}
          onRun={(task, context) => runAgent(detailAgent.name, task, context)}
        />
      )}
    </div>
  );
}
