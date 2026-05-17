import { useEffect, useState } from "react";
import { fetchGitDiffNumbered, gitStage, gitUnstage, gitDiscard } from "../lib/api";
import type { HunkLine } from "../lib/api";
import { useGit } from "../GitContext";

type DiffMode = "unified" | "split";

interface LinePair {
  left: HunkLine | null;
  right: HunkLine | null;
  lineType: "context" | "modified" | "added" | "removed";
}

function buildSplitLines(hunks: HunkLine[]): LinePair[] {
  const pairs: LinePair[] = [];
  let i = 0;
  while (i < hunks.length) {
    const line = hunks[i];
    if (line.type === "context") {
      pairs.push({ left: line, right: line, lineType: "context" });
      i++;
    } else if (line.type === "removed") {
      // Next line might be the matching added line
      const next = i + 1 < hunks.length ? hunks[i + 1] : null;
      if (next && next.type === "added" && next.new_ln !== null && line.old_ln !== null) {
        pairs.push({ left: line, right: next, lineType: "modified" });
        i += 2;
      } else {
        pairs.push({ left: line, right: null, lineType: "removed" });
        i++;
      }
    } else if (line.type === "added") {
      // Check if previous was removed (already handled)
      const prev = i > 0 ? hunks[i - 1] : null;
      if (prev && prev.type === "removed") {
        // Already handled in the removed case above
        i++;
      } else {
        pairs.push({ left: null, right: line, lineType: "added" });
        i++;
      }
    } else {
      pairs.push({ left: null, right: line, lineType: "context" });
      i++;
    }
  }
  return pairs;
}

function highlightSyntax(text: string, _ext: string): string {
  // Remove leading +/-/space for content highlighting
  const prefix = text.length > 0 ? text[0] : "";
  const content = text.substring(1);

  let highlighted = content
    .replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '<span class="diff-syn-string">$&</span>')
    .replace(/\/\/.*$/gm, '<span class="diff-syn-comment">$&</span>')
    .replace(/\/\*[\s\S]*?\*\//g, '<span class="diff-syn-comment">$&</span>')
    .replace(/\b(function|const|let|var|if|else|for|while|return|import|export|from|class|extends|new|this|async|await|try|catch|throw|def|class|import|from|as)\b/g, '<span class="diff-syn-keyword">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="diff-syn-number">$1</span>');

  return prefix + highlighted;
}

function DiffLineUnified({ line, fileExt }: { line: HunkLine; fileExt: string }) {
  const isAdded = line.text.startsWith("+") && !line.text.startsWith("+++");
  const isRemoved = line.text.startsWith("-") && !line.text.startsWith("---");
  const isHunk = line.text.startsWith("@@");
  const cls = isAdded ? "diff-added" : isRemoved ? "diff-removed" : isHunk ? "diff-hunk" : "diff-context";
  const oldStr = line.old_ln != null ? String(line.old_ln) : "";
  const newStr = line.new_ln != null ? String(line.new_ln) : "";
  return (
    <div className={`diff-line ${cls}`}>
      <span className="diff-line-old-num">{oldStr}</span>
      <span className="diff-line-new-num">{newStr}</span>
      {isAdded || isRemoved ? (
        <span className="diff-line-sign">{isAdded ? "+" : "-"}</span>
      ) : (
        <span className="diff-line-sign" />
      )}
      <span className="diff-line-body" dangerouslySetInnerHTML={{ __html: highlightSyntax(line.text, fileExt) }} />
    </div>
  );
}

function SplitColumn({
  lines,
  side,
  fileExt,
}: {
  lines: LinePair[];
  side: "left" | "right";
  fileExt: string;
}) {
  return (
    <div className="diff-split-column">
      {lines.map((pair, i) => {
        const line = side === "left" ? pair.left : pair.right;
        if (!line) {
          return <div key={i} className="diff-line diff-empty" />;
        }
        const isAdded = line.text.startsWith("+") && !line.text.startsWith("+++");
        const isRemoved = line.text.startsWith("-") && !line.text.startsWith("---");
        const isHunk = line.text.startsWith("@@");
        const cls = isAdded ? "diff-added" : isRemoved ? "diff-removed" : isHunk ? "diff-hunk" :
          pair.lineType === "modified" && side === "left" ? "diff-removed" :
          pair.lineType === "modified" && side === "right" ? "diff-added" : "diff-context";
        const ln = side === "left" ? line.old_ln : line.new_ln;
        const sign = side === "left" && isRemoved ? "-" : side === "right" && isAdded ? "+" : "";
        return (
          <div className={`diff-line ${cls}`} key={i}>
            <span className="diff-line-num-split">{ln != null ? ln : ""}</span>
            {sign && <span className="diff-line-sign">{sign}</span>}
            {!sign && <span className="diff-line-sign" />}
            <span className="diff-line-body" dangerouslySetInnerHTML={{ __html: highlightSyntax(line.text, fileExt) }} />
          </div>
        );
      })}
    </div>
  );
}

function getFileExt(file: string): string {
  const i = file.lastIndexOf(".");
  return i > 0 ? file.substring(i + 1).toLowerCase() : "";
}

export default function DiffPreview({ repoRoot, file, cached, onClose }: {
  repoRoot: string;
  file: string;
  cached?: boolean;
  onClose: () => void;
}) {
  const { refresh, addConsole } = useGit();
  const [diffText, setDiffText] = useState("");
  const [hunks, setHunks] = useState<HunkLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<DiffMode>("unified");
  const fileExt = getFileExt(file);

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
        if (allLines.length === 0 && d.diff) {
          allLines.push({ type: "context", old_ln: null, new_ln: null, text: d.diff });
        }
        setHunks(allLines);
        setDiffText(d.diff || "");
      })
      .catch(() => {
        setHunks([{ type: "context", old_ln: null, new_ln: null, text: "Error loading diff" }]);
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
  if (hunks.length === 0 && !diffText) return null;

  const splitPairs = mode === "split" ? buildSplitLines(hunks) : [];

  return (
    <div className="git-diff-preview">
      <div className="git-diff-header">
        <span className="git-diff-file">{file}</span>
        <div className="git-diff-actions">
          <div className="git-diff-mode-toggle">
            <button
              className={`btn-xs ${mode === "unified" ? "btn-primary" : ""}`}
              onClick={() => setMode("unified")}
            >Unified</button>
            <button
              className={`btn-xs ${mode === "split" ? "btn-primary" : ""}`}
              onClick={() => setMode("split")}
            >Split</button>
          </div>
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
      {mode === "unified" ? (
        <div className="git-diff-content">
          {hunks.map((line, i) => <DiffLineUnified key={i} line={line} fileExt={fileExt} />)}
        </div>
      ) : (
        <div className="git-diff-split">
          <SplitColumn lines={splitPairs} side="left" fileExt={fileExt} />
          <div className="diff-split-divider" />
          <SplitColumn lines={splitPairs} side="right" fileExt={fileExt} />
        </div>
      )}
    </div>
  );
}
