import { useState } from "react";
import type { AgentDetail } from "../lib/api";

interface Props {
  agent: AgentDetail;
  onClose: () => void;
  onRun: (task: string, context: string) => Promise<{ result: string; run_id: string }>;
}

export default function AgentDetailModal({ agent, onClose, onRun }: Props) {
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState("");
  const [runId, setRunId] = useState("");
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (!task.trim()) return;
    setRunning(true);
    setResult("");
    setRunId("");
    try {
      const res = await onRun(task.trim(), context.trim());
      setResult(res.result);
      setRunId(res.run_id);
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : "Run failed"}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="settings-modal agent-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h2>{agent.name}</h2>
          <button className="settings-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-body" style={{ flexDirection: "column", gap: 16 }}>
          {/* Description */}
          <div>
            <label className="detail-label">Description</label>
            <div className="detail-value">{agent.description}</div>
          </div>

          {/* Model */}
          <div>
            <label className="detail-label">Model</label>
            <div className="detail-value">
              {agent.model_provider}/{agent.model}
              <span style={{ marginLeft: 8, color: "var(--text-dim)", fontSize: 12 }}>
                (temp: {agent.temperature}, max_tokens: {agent.max_tokens})
              </span>
            </div>
          </div>

          {/* Tools */}
          <div>
            <label className="detail-label">Tools ({agent.tools.length})</label>
            <div className="detail-tags">
              {agent.tools.map((t) => (
                <span key={t} className="memory-tag">{t}</span>
              ))}
              {agent.tools.length === 0 && (
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>None</span>
              )}
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label className="detail-label">System Prompt</label>
            <pre className="detail-prompt">{agent.system_prompt}</pre>
          </div>

          {/* Test Run */}
          <div>
            <label className="detail-label">Test Run</label>
            <textarea
              className="detail-input"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Enter a task for this agent..."
              rows={3}
            />
            <input
              className="detail-input"
              style={{ marginTop: 6 }}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Optional context..."
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button className="btn-sm btn-primary" onClick={handleRun} disabled={running || !task.trim()}>
                {running ? "Running..." : "Run"}
              </button>
            </div>
            {runId && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                Run ID: {runId}
              </div>
            )}
            {result && (
              <div className="detail-result">
                <pre>{result}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
