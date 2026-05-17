import { useState, useMemo, useRef, useEffect } from "react";
import type { ConflictFile } from "../lib/api";

function reconstructVersion(segments: ConflictFile["segments"], includeTypes: Set<string>): string {
  return segments
    .filter((s) => includeTypes.has(s.type))
    .map((s) => s.content)
    .join("\n");
}

interface Props {
  conflict: ConflictFile;
  resolving: boolean;
  onResolve: (strategy: "ours" | "theirs" | "manual", content?: string) => void;
}

export default function ConflictMergeView({ conflict, resolving, onResolve }: Props) {
  const oursContent = useMemo(
    () => reconstructVersion(conflict.segments, new Set(["context", "ours"])),
    [conflict.segments]
  );
  const theirsContent = useMemo(
    () => reconstructVersion(conflict.segments, new Set(["context", "theirs"])),
    [conflict.segments]
  );
  const initialContent = useMemo(
    () => conflict.segments.map((s) => s.content).join("\n"),
    [conflict.segments]
  );

  const [editContent, setEditContent] = useState(initialContent);
  const [selectedTab, setSelectedTab] = useState<"ours" | "theirs" | null>(null);
  const centerRef = useRef<HTMLTextAreaElement>(null);

  // Reset when conflict file changes
  useEffect(() => {
    setEditContent(initialContent);
    setSelectedTab(null);
  }, [initialContent]);

  const handleAcceptOurs = () => {
    setEditContent(oursContent);
    setSelectedTab("ours");
  };

  const handleAcceptTheirs = () => {
    setEditContent(theirsContent);
    setSelectedTab("theirs");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onResolve("manual", editContent);
    }
  };

  return (
    <div className="cmv-container">
      <div className="cmv-file-header">{conflict.file}</div>

      {/* Pane tabs (mobile-friendly alternative to full three-pane) */}
      <div className="cmv-panes">
        {/* Left: OURS */}
        <div className="cmv-pane cmv-pane-left">
          <div className="cmv-pane-header">
            <span className="cmv-pane-title">Local</span>
            <span className="cmv-pane-badge ours">OURS</span>
          </div>
          <div className="cmv-pane-scroll">
            <pre className="cmv-pane-content">{oursContent || "(empty)"}</pre>
          </div>
        </div>

        {/* Center: Result (editable) */}
        <div className="cmv-pane cmv-pane-center">
          <div className="cmv-pane-header">
            <span className="cmv-pane-title">Result</span>
            {selectedTab && (
              <span className={`cmv-pane-badge ${selectedTab}`}>
                {selectedTab === "ours" ? "Accepting Ours" : "Accepting Theirs"}
              </span>
            )}
          </div>
          <textarea
            ref={centerRef}
            className="cmv-pane-editor"
            value={editContent}
            onChange={(e) => {
              setEditContent(e.target.value);
              setSelectedTab(null);
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            wrap="off"
          />
        </div>

        {/* Right: THEIRS */}
        <div className="cmv-pane cmv-pane-right">
          <div className="cmv-pane-header">
            <span className="cmv-pane-title">Incoming</span>
            <span className="cmv-pane-badge theirs">THEIRS</span>
          </div>
          <div className="cmv-pane-scroll">
            <pre className="cmv-pane-content">{theirsContent || "(empty)"}</pre>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="cmv-actions">
        <button
          className="btn-sm"
          onClick={() => onResolve("ours")}
          disabled={resolving}
        >
          ← Accept Ours
        </button>
        <button
          className="btn-sm"
          onClick={handleAcceptOurs}
          disabled={resolving}
          title="Preview our version in Result pane"
        >
          Show Ours
        </button>
        <button
          className="btn-sm"
          onClick={handleAcceptTheirs}
          disabled={resolving}
          title="Preview their version in Result pane"
        >
          Show Theirs
        </button>
        <button
          className="btn-sm"
          onClick={() => onResolve("theirs")}
          disabled={resolving}
        >
          Accept Theirs →
        </button>
        <button
          className="btn-sm btn-primary"
          onClick={() => onResolve("manual", editContent)}
          disabled={resolving || editContent === initialContent}
        >
          {resolving ? "Applying..." : "Apply Result"}
        </button>
      </div>
      <div className="cmv-hint">
        <span>Edit the Result pane directly, or select Ours/Theirs and fine-tune. <kbd>⌘Enter</kbd> to apply.</span>
      </div>
    </div>
  );
}
