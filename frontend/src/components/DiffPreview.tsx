import { useEffect, useState } from "react";
import { fetchGitDiffNumbered, gitStage, gitUnstage, gitDiscard } from "../lib/api";
import type { HunkLine } from "../lib/api";
import { useGit } from "../GitContext";

function renderNumberedLine(line: HunkLine, index: number): JSX.Element {
  const oldStr = line.old_ln != null ? String(line.old_ln) : "";
  const newStr = line.new_ln != null ? String(line.new_ln) : "";
  const cls = line.type === "added" ? "diff-added" : line.type === "removed" ? "diff-removed" : "diff-context";
  return (
    <div key={index} className={`diff-line ${cls}`}>
      <span className="diff-line-old-num">{oldStr}</span>
      <span className="diff-line-new-num">{newStr}</span>
      <span className="diff-line-body">{line.text}</span>
    </div>
  );
}

export default function DiffPreview({ repoRoot, file, cached, onClose }: {
  repoRoot: string;
  file: string;
  cached?: boolean;
  onClose: () => void;
}) {
  const { refresh, addConsole } = useGit();
  const [lines, setLines] = useState<HunkLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchGitDiffNumbered(repoRoot, file, cached)
      .then((d) => {
        const allLines: HunkLine[] = [];
        if (d.hunks) {
          for (const hunk of d.hunks) {
            allLines.push({ type: "context", old_ln: null, new_ln: null, text: hunk.header });
            allLines.push(...hunk.lines);
          }
        }
        // Fallback: if no hunks, create a synthetic "no diff" line
        if (allLines.length === 0 && d.diff) {
          allLines.push({ type: "context", old_ln: null, new_ln: null, text: d.diff });
        }
        setLines(allLines);
      })
      .catch(() => {
        setLines([{ type: "context", old_ln: null, new_ln: null, text: "Error loading diff" }]);
      })
      .finally(() => setLoading(false));
  }, [repoRoot, file, cached]);

  const handleStage = async () => {
    try { await gitStage(repoRoot, [file]); refresh(); }
    catch (e: any) { addConsole("stage", `Error: ${e.message}`); }
  };
  const handleUnstage = async () => {
    try { await gitUnstage(repoRoot, [file]); refresh(); }
    catch (e: any) { addConsole("unstage", `Error: ${e.message}`); }
  };
  const handleDiscard = async () => {
    if (!confirm(`Discard changes in ${file}?`)) return;
    try { await gitDiscard(repoRoot, [file]); refresh(); }
    catch (e: any) { addConsole("discard", `Error: ${e.message}`); }
  };

  if (loading) return <div className="git-diff-preview" style={{ padding: 8, fontSize: 11, color: "var(--text-dim)" }}>Loading diff...</div>;
  if (lines.length === 0) return null;

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
        {lines.map((line, i) => renderNumberedLine(line, i))}
      </div>
    </div>
  );
}
