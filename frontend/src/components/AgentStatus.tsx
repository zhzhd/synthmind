interface Props {
  status: "idle" | "thinking" | "error";
  provider: string;
  model: string;
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Ready",
  thinking: "Thinking...",
  error: "Error",
};

export default function AgentStatus({ status, provider, model }: Props) {
  return (
    <div className="agent-status">
      <span className={`dot ${status}`} />
      <span>{STATUS_LABELS[status]}</span>
      {model && (
        <>
          <span style={{ margin: "0 4px", color: "var(--text-dim)" }}>·</span>
          <span style={{ fontSize: 12 }}>
            {provider}/{model}
          </span>
        </>
      )}
    </div>
  );
}
