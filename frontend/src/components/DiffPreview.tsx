import { useEffect, useState } from "react";
import { fetchGitDiff, gitStage, gitUnstage, gitDiscard } from "../lib/api";

function renderDiffLine(line: string, index: number): JSX.Element {
  if (line.startsWith("@@")) {
    return (
      <div key={index} className="diff-line diff-hunk">
        <span className="diff-line-num" />
        <span className="diff-line-body">{line}</span>
      </div>
    );
  }
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return (
      <div key={index} className="diff-line diff-added">
        <span className="diff-line-sign">+</span>
        <span className="diff-line-body">{line.slice(1)}</span>
      </div>
    );
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return (
      <div key={index} className="diff-line diff-removed">
        <span className="diff-line-sign">-</span>
        <span className="diff-line-body">{line.slice(1)}</span>
      </div>
    );
  }
  // Context (unchanged) lines
  return (
    <div key={index} className="diff-line diff-context">
      <span className="diff-line-sign"> </span>
      <span className="diff-line-body">{line}</span>
    </div>
  );
}

export default function DiffPreview({ repoRoot, file, cached, onAction, onClose }: {
  repoRoot: string;
  file: string;
  cached?: boolean;
  onAction: () => void;
  onClose: () => void;
}) {
  const [diff, setDiff] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchGitDiff(repoRoot, file, cached)
      .then((d) => setDiff(d.diff || ""))
      .catch(() => setDiff("Error loading diff"))
      .finally(() => setLoading(false));
  }, [repoRoot, file, cached]);

  const handleStage = async () => {
    try { await gitStage(repoRoot, [file]); onAction(); }
    catch (e: any) { alert(e.message); }
  };
  const handleUnstage = async () => {
    try { await gitUnstage(repoRoot, [file]); onAction(); }
    catch (e: any) { alert(e.message); }
  };
  const handleDiscard = async () => {
    if (!confirm(`Discard changes in ${file}?`)) return;
    try { await gitDiscard(repoRoot, [file]); onAction(); }
    catch (e: any) { alert(e.message); }
  };

  if (loading) return <div className="git-diff-preview" style={{ padding: 8, fontSize: 11, color: "var(--text-dim)" }}>Loading diff...</div>;
  if (!diff) return null;

  const lines = diff.split("\n");

  return (
    <div className="git-diff-preview">
      <div className="git-diff-header">
        <span className="git-diff-file">{file}</span>
        <div className="git-diff-actions">
          {cached ? (
            <button className="btn-xs" onClick={handleUnstage}>Unstage</button>
          ) : (
            <>
              <button className="btn-xs" onClick={handleStage}>Stage</button>
              <button className="btn-xs btn-danger" onClick={handleDiscard}>Discard</button>
            </>
          )}
          <button className="btn-xs" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="git-diff-content">
        {lines.map((line, i) => renderDiffLine(line, i))}
      </div>
    </div>
  );
}
