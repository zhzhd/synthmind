import React, { useEffect, useRef, useState } from "react";
import type { ModelConfig, PendingApproval } from "../lib/api";
import { sendMessage, approveTool, approveAll, fetchThreadHistory } from "../lib/api";

interface Message {
  role: "user" | "assistant" | "tool-call" | "approval";
  content: string;
  pending?: PendingApproval[];
}

interface Props {
  modelConfig: ModelConfig;
}

function ApprovalCard({ pending, onDecision, disabled }: {
  pending: PendingApproval;
  onDecision: (decision: "approve" | "reject") => void;
  disabled: boolean;
}) {
  const argsStr = JSON.stringify(pending.tool_args, null, 2);

  return (
    <div className="approval-card">
      <div className="approval-header">🔒 Tool requires approval</div>
      <div className="approval-tool">
        <strong>{pending.tool_name}</strong>
      </div>
      {argsStr !== "{}" && (
        <pre className="approval-args">{argsStr}</pre>
      )}
      <div className="approval-actions">
        <button
          className="btn-sm btn-primary"
          onClick={() => onDecision("approve")}
          disabled={disabled}
        >
          ✅ Approve
        </button>
        <button
          className="btn-sm"
          style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
          onClick={() => onDecision("reject")}
          disabled={disabled}
        >
          ✕ Reject
        </button>
      </div>
    </div>
  );
}

export default function ChatWindow({ modelConfig }: Props) {
  const [threadId, setThreadId] = useState<string | undefined>(() => {
    try { return localStorage.getItem("synthmind_thread_id") || undefined; } catch { return undefined; }
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

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
        else if (m.role === "assistant") msgs.push({ role: "assistant", content: m.content });
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

  // Persist thread_id
  useEffect(() => { if (threadId) localStorage.setItem("synthmind_thread_id", threadId); }, [threadId]);

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
      const res = await sendMessage(text, modelConfig, threadId);
      setThreadId(res.thread_id);

      if (res.type === "approval" && res.pending && res.pending.length > 0) {
        // Show approval cards
        for (const p of res.pending) {
          setMessages((prev) => [
            ...prev,
            { role: "approval", content: "", pending: [p] },
          ]);
        }
      } else if (res.type === "response" && res.message) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.message! },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Failed to get response"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (pendingId: string, decision: "approve" | "reject") => {
    if (loading) return;
    setLoading(true);

    try {
      const res = await approveTool(pendingId, decision);
      setThreadId(res.thread_id);

      // Remove the approval card and show result
      setMessages((prev) => {
        const idx = prev.findLastIndex(
          (m) => m.role === "approval" && m.pending?.[0]?.pending_id === pendingId,
        );
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            content: decision === "approve" ? "✅ Approved" : "✕ Rejected",
          };

          // If the response includes a follow-up message
          if (res.type === "response" && res.message) {
            updated.push({ role: "assistant", content: res.message! });
          }
          // If another approval is needed
          if (res.type === "approval" && res.pending) {
            for (const p of res.pending) {
              updated.push({ role: "approval", content: "", pending: [p] });
            }
          }
          return updated;
        }
        // Fallback: just append
        const updated = [...prev];
        if (res.type === "response" && res.message) {
          updated.push({ role: "assistant", content: res.message! });
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

  const handleApproveAll = async () => {
    if (loading || !threadId) return;
    setLoading(true);

    // Collect all unresolved pending IDs
    const unresolved = messages.filter(
      (m) => m.role === "approval" && m.content === "" && m.pending?.[0],
    );
    const pendingIds = unresolved.map((m) => m.pending![0].pending_id);

    if (pendingIds.length === 0) return;

    try {
      const res = await approveAll(pendingIds, threadId);

      // Mark all as approved
      setMessages((prev) => {
        const updated = [...prev];
        for (const m of updated) {
          if (m.role === "approval" && m.content === "" && m.pending?.[0]) {
            m.content = "✅ Approved";
          }
        }
        if (res.type === "response" && res.message) {
          updated.push({ role: "assistant", content: res.message! });
        }
        if (res.type === "approval" && res.pending) {
          for (const p of res.pending) {
            updated.push({ role: "approval", content: "", pending: [p] });
          }
        }
        return updated;
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Approve all error: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (msg: Message, i: number) => {
    if (msg.role === "approval" && msg.pending?.[0]) {
      return (
        <div key={i} className="message approval-wrapper">
          <ApprovalCard
            pending={msg.pending[0]}
            onDecision={(decision) => handleApproval(msg.pending![0].pending_id, decision)}
            disabled={loading || msg.content !== ""}
          />
          {msg.content && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{msg.content}</div>}
        </div>
      );
    }
    return <div key={i} className={`message ${msg.role}`}>{msg.content}</div>;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-area">
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
    </div>
  );
}
