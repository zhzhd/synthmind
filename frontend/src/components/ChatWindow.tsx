import React, { useEffect, useRef, useState } from "react";
import type { ModelConfig, PendingApproval } from "../lib/api";
import { sendMessage, sendMessageStream, approveTool, approveAll, fetchThreadHistory } from "../lib/api";

interface Message {
  role: "user" | "assistant" | "tool-call" | "approval";
  content: string;
  reasoning?: string;
  pending?: PendingApproval[];
}

interface Props {
  modelConfig: ModelConfig;
  threadId?: string;
  onThreadChange?: (threadId: string) => void;
}

function ApprovalCard({ pending, onDecision, disabled }: {
  pending: PendingApproval;
  onDecision: (decision: "approve" | "reject" | "approve-whitelist") => void;
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
          style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          onClick={() => onDecision("approve-whitelist")}
          disabled={disabled}
        >
          ✅ Approve &amp; Whitelist
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

export default function ChatWindow({ modelConfig, threadId: propThreadId, onThreadChange }: Props) {
  const [threadId, setThreadId] = useState<string | undefined>(propThreadId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

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

    // Try streaming; fall back to non-streaming on failure
    const currentThreadId = threadId;
    let newThreadId = currentThreadId;

    setStreamingReasoning("");
    setStreamingContent("");
    setIsStreaming(true);

    // Local accumulators (not affected by React batching)
    let localReasoning = "";
    let localContent = "";
    let streamedOk = false;
    try {
      await sendMessageStream(text, modelConfig, currentThreadId, (event) => {
        if (event.type === "reasoning") {
          localReasoning += (event.data.content as string);
          setStreamingReasoning(localReasoning);
        } else if (event.type === "content") {
          localContent += (event.data.content as string);
          setStreamingContent(localContent);
        } else if (event.type === "done") {
          const d = event.data as Record<string, unknown>;
          if (d.thread_id) newThreadId = d.thread_id as string;
          const msgContent = (d.content as string) || localContent;
          const msgReasoning = (d.reasoning_content as string) || localReasoning;
          const msg: Message = { role: "assistant", content: msgContent };
          if (msgReasoning) msg.reasoning = msgReasoning;
          setMessages((prev) => [...prev, msg]);
          streamedOk = true;
        } else if (event.type === "fallback") {
          // Tool calls detected — streaming can't execute tools,
          // fall back to non-streaming agent flow
          console.log("Stream fallback (tool_calls):", event.data);
          streamedOk = false; // don't mark as streamed
        } else if (event.type === "error") {
          console.warn("Stream event error:", event.data.error);
        }
      });
    } catch (streamErr) {
      console.warn("Streaming failed, falling back:", streamErr);
    } finally {
      setIsStreaming(false);
      setStreamingReasoning("");
      setStreamingContent("");
    }

    if (streamedOk) {
      if (newThreadId && newThreadId !== currentThreadId) onThreadChange?.(newThreadId);
      setLoading(false);
      return;
    }

    // Stream ended without done event — use what we received locally
    if (localContent || localReasoning) {
      const msg: Message = { role: "assistant", content: localContent || localReasoning };
      if (localReasoning) msg.reasoning = localReasoning;
      setMessages((prev) => [...prev, msg]);
      if (newThreadId && newThreadId !== currentThreadId) onThreadChange?.(newThreadId);
      setLoading(false);
      return;
    }

    // Fallback to non-streaming
    try {
      const res = await sendMessage(text, modelConfig, threadId);
      if (res.thread_id !== threadId) onThreadChange?.(res.thread_id);

      if (res.type === "approval" && res.pending?.length) {
        for (const p of res.pending) {
          setMessages((prev) => [...prev, { role: "approval", content: "", pending: [p] }]);
        }
      } else if (res.type === "response" && res.message) {
        const msg: Message = { role: "assistant", content: res.message };
        if ((res as any).reasoning_content) msg.reasoning = (res as any).reasoning_content;
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

      // Remove the approval card and show result
      setMessages((prev) => {
        const idx = [...prev].reverse().findIndex(
          (m: Message) => m.role === "approval" && m.pending?.[0]?.pending_id === pendingId,
        );
        const actualIdx = idx >= 0 ? prev.length - 1 - idx : -1;
        if (actualIdx >= 0) {
          const label = whitelist ? "✅ Approved (whitelisted)" : (actualDecision === "approve" ? "✅ Approved" : "✕ Rejected");
          const updated = [...prev];
          updated[actualIdx] = {
            ...updated[actualIdx],
            content: label,
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
    if (msg.role === "assistant" && msg.reasoning) {
      return (
        <div key={i} className={`message assistant`}>
          <ThinkingBlock reasoning={msg.reasoning} />
          {msg.content && <div style={{ marginTop: 8 }}>{msg.content}</div>}
          {!msg.content && <div style={{ marginTop: 8, color: "var(--text-dim)", fontStyle: "italic" }}>{msg.reasoning}</div>}
        </div>
      );
    }
    return <div key={i} className={`message ${msg.role}`}>{msg.content}</div>;
  };

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
        {isStreaming && (
          <div className={`message assistant streaming ${streamingContent ? "" : "thinking"}`}>
            <div className="thinking-block streaming-thinking" style={{ border: "1px solid var(--accent-blue)", background: "var(--surface)" }}>
              <div className="thinking-toggle" style={{ cursor: "default", color: "var(--accent-blue)" }}>
                <span className="thinking-icon">▼</span>
                <span className="thinking-label">Thinking</span>
                <span className="thinking-length">{streamingReasoning.length} chars</span>
              </div>
              <div className="thinking-content" style={{ maxHeight: 300, overflowY: "auto" }}>
                {streamingReasoning || "..."}
              </div>
            </div>
            {streamingContent ? (
              <div style={{ marginTop: 8, padding: "4px 0" }}>{streamingContent}</div>
            ) : null}
          </div>
        )}
        {!isStreaming && loading && (
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
