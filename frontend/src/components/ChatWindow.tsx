import React, { useEffect, useRef, useState } from "react";
import type { ModelConfig, PendingApproval } from "../lib/api";
import { sendMessage, approveTool, approveAll, fetchThreadHistory } from "../lib/api";
import TimeTravelPanel from "./TimeTravelPanel";

interface Message {
  role: "user" | "assistant" | "tool-call" | "approval";
  content: string;
  reasoning?: string;
  token_usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  pending?: PendingApproval[];
}

interface Props {
  modelConfig: ModelConfig;
  threadId?: string;
  onThreadChange?: (threadId: string) => void;
}

function ApprovalCard({ pending, onDecision, allDecisions, onApproveAll, onRejectAll, disabled }: {
  pending: PendingApproval[];
  onDecision: (pendingId: string, decision: "approve" | "reject" | "approve-whitelist") => void;
  allDecisions?: (decision: "approve" | "reject") => void;
  onApproveAll?: () => void;
  onRejectAll?: () => void;
  disabled: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const current = pending[currentIndex];
  const argsStr = current ? JSON.stringify(current.tool_args, null, 2) : "";

  if (pending.length === 0) return null;

  return (
    <div className="approval-card">
      <div className="approval-header">
        🔒 {pending.length > 1 ? `Tools require approval (${currentIndex + 1}/${pending.length})` : "Tool requires approval"}
      </div>

      {/* Navigation for multiple tools */}
      {pending.length > 1 && (
        <div className="approval-nav">
          <button className="btn-xs" onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>◀</button>
          <span className="approval-nav-dots">
            {pending.map((_, i) => (
              <span key={i} className={`approval-nav-dot ${i === currentIndex ? "active" : ""}`}
                onClick={() => setCurrentIndex(i)} />
            ))}
          </span>
          <button className="btn-xs" onClick={() => setCurrentIndex(Math.min(pending.length - 1, currentIndex + 1))} disabled={currentIndex >= pending.length - 1}>▶</button>
        </div>
      )}

      {current && (
        <>
          <div className="approval-tool">
            <strong>{current.tool_name}</strong>
          </div>
          {argsStr !== "{}" && (
            <pre className="approval-args">{argsStr}</pre>
          )}
          <div className="approval-actions">
            <button className="btn-sm btn-primary" onClick={() => onDecision(current.pending_id, "approve")} disabled={disabled}>
              ✅ {pending.length > 1 ? `Approve (${currentIndex + 1})` : "Approve"}
            </button>
            <button className="btn-sm" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
              onClick={() => onDecision(current.pending_id, "approve-whitelist")} disabled={disabled}>
              ✅ Whitelist
            </button>
            <button className="btn-sm" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={() => onDecision(current.pending_id, "reject")} disabled={disabled}>
              ✕ Reject
            </button>
          </div>
        </>
      )}

      {/* Batch actions */}
      {pending.length > 1 && (
        <div className="approval-batch" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <div className="approval-actions">
            <button className="btn-sm btn-primary" onClick={onApproveAll} disabled={disabled}>
              ✅ Approve All ({pending.length})
            </button>
            <button className="btn-sm" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={onRejectAll} disabled={disabled}>
              ✕ Reject All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatWindow({ modelConfig, threadId: propThreadId, onThreadChange }: Props) {
  const [threadId, setThreadId] = useState<string | undefined>(propThreadId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showTimeTravel, setShowTimeTravel] = useState(false);

  // Sync threadId when prop changes externally (e.g. sidebar thread selection)
  useEffect(() => {
    if (propThreadId !== threadId) {
      setThreadId(propThreadId);
      setHistoryLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propThreadId]);

  // Load thread history on mount, or show greeting for new sessions
  useEffect(() => {
    if (historyLoaded) return;
    if (!threadId) {
      setMessages([{ role: "assistant", content: "Hello! I'm SynthMind. Choose a model in the sidebar and start chatting." }]);
      setHistoryLoaded(true);
      return;
    }
    fetchThreadHistory(threadId).then((hist) => {
      const msgs: Message[] = [];
      for (const m of hist) {
        if (m.role === "user") msgs.push({ role: "user", content: m.content });
        else if (m.role === "assistant") {
          msgs.push({ role: "assistant", content: m.content, reasoning: (m as any).reasoning_content || undefined });
        }
      }
      if (msgs.length === 0) {
        msgs.push({ role: "assistant", content: "Hello! I'm SynthMind. Choose a model in the sidebar and start chatting." });
      }
      setMessages(msgs);
      setHistoryLoaded(true);
    }).catch(() => {
      setMessages([{ role: "assistant", content: "Hello! I'm SynthMind. Choose a model in the sidebar and start chatting." }]);
      setHistoryLoaded(true);
    });
  }, [threadId, historyLoaded]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (overrideMessage?: string) => {
    const text = (overrideMessage || input).trim();
    if (!text || loading) return;

    if (!overrideMessage) setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      // Use non-streaming LangGraph agent (handles tool calls, records traces)
      const res = await sendMessage(text, modelConfig, threadId);
      if (res.thread_id !== threadId) onThreadChange?.(res.thread_id);

      if (res.type === "approval" && res.pending?.length) {
        setMessages((prev) => [...prev, { role: "approval", content: "", pending: res.pending! }]);
      } else if (res.type === "response" && res.message) {
        const msg: Message = { role: "assistant", content: res.message };
        if ((res as any).reasoning_content) msg.reasoning = (res as any).reasoning_content;
        if ((res as any).token_usage) msg.token_usage = (res as any).token_usage;
        setMessages((prev) => [...prev, msg]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Failed to get response"}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (pendingId: string, decision: "approve" | "reject" | "approve-whitelist") => {
    if (loading) return;
    setLoading(true);

    try {
      const whitelist = decision === "approve-whitelist";
      const actualDecision = whitelist ? "approve" : decision;
      const res = await approveTool(pendingId, actualDecision, undefined, whitelist);
      if (res.thread_id !== threadId) {
        onThreadChange?.(res.thread_id);
      }

      // Remove the resolved pending item from the card
      setMessages((prev) => {
        const updated = [...prev];
        for (let i = 0; i < updated.length; i++) {
          const m = updated[i];
          if (m.role === "approval" && m.pending) {
            const pIdx = m.pending.findIndex((p) => p.pending_id === pendingId);
            if (pIdx >= 0) {
              const newPending = m.pending.filter((_, pi) => pi !== pIdx);
              if (newPending.length === 0 && m.content === "") {
                // All resolved — mark as done
                updated[i] = { ...m, content: "✅ Approved", pending: [] };
              } else {
                updated[i] = { ...m, pending: newPending };
              }
              break;
            }
          }
        }

        // Follow-up response
        if (res.type === "response" && res.message) {
          updated.push({ role: "assistant", content: res.message! });
        }
        if (res.type === "approval" && res.pending?.length) {
          updated.push({ role: "approval", content: "", pending: res.pending });
        }
        return updated;
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Approval error: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getUnresolvedPendingIds = () => {
    const ids: string[] = [];
    for (const m of messages) {
      if (m.role === "approval" && m.content === "" && m.pending) {
        for (const p of m.pending) {
          if (p.pending_id) ids.push(p.pending_id);
        }
      }
    }
    return ids;
  };

  const handleApproveAll = async () => {
    if (loading || !threadId) return;
    setLoading(true);

    const pendingIds = getUnresolvedPendingIds();
    if (pendingIds.length === 0) { setLoading(false); return; }

    try {
      const res = await approveAll(pendingIds, threadId);

      // Mark all approval messages as approved
      setMessages((prev) => {
        const updated = [...prev];
        for (const m of updated) {
          if (m.role === "approval" && m.content === "") {
            m.content = "✅ Approved";
          }
        }
        if (res.type === "response" && res.message) {
          updated.push({ role: "assistant", content: res.message! });
        }
        if (res.type === "approval" && res.pending?.length) {
          updated.push({ role: "approval", content: "", pending: res.pending });
        }
        return updated;
      });
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Approve all error: ${err instanceof Error ? err.message : "Unknown error"}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectAll = async () => {
    if (loading || !threadId) return;
    setLoading(true);

    const pendingIds = getUnresolvedPendingIds();
    // Reject each individually via the approve endpoint with decision="reject"
    try {
      for (const pid of pendingIds) {
        await approveTool(pid, "reject");
      }
      // Mark all as rejected
      setMessages((prev) => {
        const updated = [...prev];
        for (const m of updated) {
          if (m.role === "approval" && m.content === "") {
            m.content = "✕ Rejected";
          }
        }
        return updated;
      });
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Reject all error: ${err instanceof Error ? err.message : "Unknown error"}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (msg: Message, i: number) => {
    if (msg.role === "approval" && msg.pending?.length) {
      return (
        <div key={i} className="message approval-wrapper">
          <ApprovalCard
            pending={msg.pending}
            onDecision={(pendingId, decision) => handleApproval(pendingId, decision)}
            onApproveAll={() => handleApproveAll()}
            onRejectAll={() => handleRejectAll()}
            disabled={loading || msg.content !== ""}
          />
          {msg.content && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{msg.content}</div>}
        </div>
      );
    }
    if (msg.role === "assistant" && msg.reasoning) {
      return (
        <div key={i} className={`message assistant`}>
          <ThinkingBlock reasoning={msg.reasoning} />
          {msg.content && <div style={{ marginTop: 8 }}>{msg.content}</div>}
          {!msg.content && <div style={{ marginTop: 8, color: "var(--text-dim)", fontStyle: "italic" }}>{msg.reasoning}</div>}
          {msg.token_usage && <TokenBadge usage={msg.token_usage} />}
        </div>
      );
    }
    if (msg.role === "assistant") {
      return (
        <div key={i} className={`message assistant`}>
          <div>{msg.content}</div>
          {msg.token_usage && <TokenBadge usage={msg.token_usage} />}
        </div>
      );
    }
    return <div key={i} className={`message ${msg.role}`}>{msg.content}</div>;
  };

function TokenBadge({ usage }: { usage: { input_tokens: number; output_tokens: number; total_tokens: number } }) {
  if (!usage || !usage.total_tokens) return null;
  return (
    <div className="token-badge" title={`Input: ${usage.input_tokens}, Output: ${usage.output_tokens}`}>
      <span className="token-badge-icon">⚡</span>
      <span className="token-badge-text">{usage.total_tokens} tokens</span>
    </div>
  );
}

function ThinkingBlock({ reasoning }: { reasoning: string }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="thinking-block">
      <button className="thinking-toggle" onClick={() => setCollapsed(!collapsed)}>
        <span className="thinking-icon">{collapsed ? "▶" : "▼"}</span>
        <span className="thinking-label">Thought Process</span>
        <span className="thinking-length">{reasoning.length} characters</span>
      </button>
      {!collapsed && (
        <div className="thinking-content">{reasoning}</div>
      )}
    </div>
  );
}

  const handleBranchCreated = (newThreadId: string) => {
    setShowTimeTravel(false);
    onThreadChange?.(newThreadId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-area">
      {threadId && (
        <div className="chat-header">
          <span className="chat-header-title">Chat</span>
          <button
            className="header-btn"
            onClick={() => setShowTimeTravel(true)}
            title="Time Travel — browse execution history and branch"
          >
            ⟳
          </button>
        </div>
      )}
      <div className="messages">
        {messages.map((msg, i) => {
          // Show Approve All button before the first unresolved approval card
          if (i === messages.findIndex((m) => m.role === "approval" && m.content === "" && m.pending?.[0])) {
            const count = messages.filter(
              (m) => m.role === "approval" && m.content === "" && m.pending?.[0]
            ).length;
            if (count > 0) {
              return (
                <React.Fragment key={`approve-all-${i}`}>
                  <div style={{ alignSelf: "center", margin: "4px 0 8px" }}>
                    <button className="btn-sm btn-primary" onClick={handleApproveAll} disabled={loading}>
                      ✅ Approve All ({count})
                    </button>
                  </div>
                  {renderMessage(msg, i)}
                </React.Fragment>
              );
            }
          }
          return renderMessage(msg, i);
        })}
        {loading && (
          <div className="message assistant" style={{ opacity: 0.6 }}>
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <div className="input-row">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for new line)"
            rows={1}
            disabled={loading}
          />
          <button onClick={() => handleSend()} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>

      {showTimeTravel && threadId && (
        <TimeTravelPanel
          threadId={threadId}
          onBranchCreated={handleBranchCreated}
          onClose={() => setShowTimeTravel(false)}
        />
      )}
    </div>
  );
}
