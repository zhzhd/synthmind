import { useEffect, useState } from "react";
import { fetchCheckpoints, branchFromCheckpoint } from "../lib/api";
import type { CheckpointInfo } from "../lib/api";
import { useTranslation } from "../useLanguage";

interface Props {
  threadId: string;
  onBranchCreated: (newThreadId: string) => void;
  onClose: () => void;
}

export default function TimeTravelPanel({ threadId, onBranchCreated, onClose }: Props) {
  const { t } = useTranslation();
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [branching, setBranching] = useState<string | null>(null);
  const [branchMsg, setBranchMsg] = useState("");
  const [showBranchInput, setShowBranchInput] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCheckpoints(threadId);
      setCheckpoints(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [threadId]);

  const handleBranch = async (checkpointId: string) => {
    setBranching(checkpointId);
    try {
      const result = await branchFromCheckpoint(threadId, checkpointId, branchMsg || undefined);
      if ("thread_id" in result && result.thread_id) {
        onBranchCreated(result.thread_id);
      }
    } catch (e: any) {
      alert(`Branch failed: ${e.message}`);
    } finally {
      setBranching(null);
      setBranchMsg("");
      setShowBranchInput(null);
    }
  };

  const getNodeIcon = (node: string) => {
    switch (node) {
      case "input": return "📥";
      case "loop": return "🔄";
      default: return "●";
    }
  };

  const getNextLabel = (next: string[]) => {
    if (next.length === 0) return "END";
    return next.join(", ");
  };

  return (
    <div className="time-travel-overlay" onClick={onClose}>
      <div className="time-travel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="time-travel-header">
          <h2>⟳ {t("tt.title")}</h2>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="btn-sm" onClick={load} disabled={loading} style={{ fontSize: 11 }}>
              {loading ? "..." : t("tt.refresh")}
            </button>
            <button className="settings-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {loading && <div className="time-travel-loading">{t("tt.loading")}</div>}
        {error && <div className="time-travel-error">{error}</div>}

        {!loading && !error && checkpoints.length === 0 && (
          <div className="time-travel-empty">
            {t("tt.empty")}
          </div>
        )}

        {!loading && checkpoints.length > 0 && (
          <div className="time-travel-timeline">
            <div className="time-travel-list">
              {checkpoints.map((cp, i) => (
                <div key={cp.checkpoint_id} className="time-travel-item">
                  <div className="time-travel-item-connector">
                    <div className="time-travel-dot">{getNodeIcon(cp.node)}</div>
                    {i < checkpoints.length - 1 && <div className="time-travel-line" />}
                  </div>
                  <div className="time-travel-item-body">
                    <div className="time-travel-item-header">
                      <span className="time-travel-step">{t("tt.step").replace("{n}", String(cp.step))}</span>
                      <span className={`time-travel-node ${cp.node}`}>{cp.node === "input" ? "Input" : "Agent Loop"}</span>
                      <span className="time-travel-next">{t("tt.next").replace("{next}", getNextLabel(cp.next))}</span>
                    </div>
                    <div className="time-travel-preview">{cp.msg_preview || "(no message)"}</div>
                    <div className="time-travel-meta">
                      <span>{t("tt.messages").replace("{n}", String(cp.total_messages))}</span>
                    </div>
                    <div className="time-travel-actions">
                      {showBranchInput === cp.checkpoint_id ? (
                        <div className="time-travel-branch-form">
                          <input
                            type="text"
                            value={branchMsg}
                            onChange={(e) => setBranchMsg(e.target.value)}
                            placeholder={t("tt.branch_placeholder")}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleBranch(cp.checkpoint_id);
                              if (e.key === "Escape") { setShowBranchInput(null); setBranchMsg(""); }
                            }}
                          />
                          <button
                            className="btn-xs btn-primary"
                            onClick={() => handleBranch(cp.checkpoint_id)}
                            disabled={branching === cp.checkpoint_id}
                          >
                            {branching === cp.checkpoint_id ? "..." : t("tt.branch")}
                          </button>
                          <button className="btn-xs" onClick={() => { setShowBranchInput(null); setBranchMsg(""); }}>{t("files.cancel")}</button>
                        </div>
                      ) : (
                        <button
                          className="btn-xs"
                          onClick={() => setShowBranchInput(cp.checkpoint_id)}
                          title={t("tt.branch")}
                        >
                          ⎇ {t("tt.branch")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
