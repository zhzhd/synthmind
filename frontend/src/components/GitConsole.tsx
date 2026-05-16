interface ConsoleEntry {
  command: string;
  output: string;
  timestamp: number;
}

export default function GitConsole({ entries, open, onToggle, onClear }: {
  entries: ConsoleEntry[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="git-console">
      <div className="git-console-header" onClick={onToggle}>
        <span>{open ? "▼" : "▲"} Console ({entries.length})</span>
        <button className="git-console-clear" onClick={(e) => { e.stopPropagation(); onClear(); }}>Clear</button>
      </div>
      {open && (
        <div className="git-console-body">
          {entries.map((e, i) => (
            <div key={i} className="git-console-entry">
              <div className="git-console-cmd">$ {e.command}</div>
              {(e.stdout || e.stderr) && (
                <pre className="git-console-out">{(e.stdout || e.stderr).trim()}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
