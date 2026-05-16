import { useEffect, useState } from "react";
import { fetchGitBranches, fetchGitCompare, gitCheckout, gitCreateBranch, gitMerge } from "../lib/api";
import type { GitBranch, GitCompareResult } from "../lib/api";
import BranchSelector from "./BranchSelector";

export default function BranchManager({ repoRoot, onRefresh, onConsole }: {
  repoRoot: string;
  onRefresh: () => void;
  onConsole: (cmd: string, out: string) => void;
}) {
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [current, setCurrent] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [startPoint, setStartPoint] = useState("");
  const [creating, setCreating] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [compareBase, setCompareBase] = useState("");
  const [compareTarget, setCompareTarget] = useState("");
  const [compareResult, setCompareResult] = useState<GitCompareResult | null>(null);
  const [comparing, setComparing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchGitBranches(repoRoot);
      setBranches(data.branches);
      setCurrent(data.current);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [repoRoot]);

  const filtered = filter ? branches.filter((b) => b.name.includes(filter)) : branches;
  const localBranches = filtered.filter((b) => !b.name.startsWith("remotes/"));
  const remoteBranches = filtered.filter((b) => b.name.startsWith("remotes/"));
  const branchNames = branches.map((b) => b.name);

  const handleSwitch = async (name: string) => {
    try {
      await gitCheckout(repoRoot, name);
      onConsole("checkout", `Switched to ${name}`);
      onRefresh();
    } catch (e: any) { onConsole("checkout", `Error: ${e.message}`); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await gitCreateBranch(repoRoot, newName.trim(), startPoint || undefined, true);
      onConsole("create-branch", `Created and switched to ${newName}`);
      setNewName("");
      onRefresh();
    } catch (e: any) { onConsole("create-branch", `Error: ${e.message}`); }
    finally { setCreating(false); }
  };

  const handleMerge = async (branch: string) => {
    setMerging(true);
    try {
      await gitMerge(repoRoot, branch);
      onConsole("merge", `Merged ${branch} into ${current}`);
      setMergeTarget(null);
      onRefresh();
    } catch (e: any) { onConsole("merge", `Error: ${e.message}`); }
    finally { setMerging(false); }
  };

  const handleCompare = async () => {
    if (!compareBase) return;
    setComparing(true);
    setCompareResult(null);
    try {
      const r = await fetchGitCompare(repoRoot, compareBase, compareTarget || undefined);
      setCompareResult(r);
      onConsole("compare", `${r.base} vs ${r.target}: ${r.ahead} ahead, ${r.behind} behind, ${r.files.length} files changed`);
    } catch (e: any) { onConsole("compare", `Error: ${e.message}`); }
    finally { setComparing(false); }
  };

  const STATUS_MAP: Record<string, string> = {
    A: "added", M: "modified", D: "deleted", R: "renamed", C: "copied",
  };

  const renderBranch = (b: GitBranch) => (
    <div key={b.name} className={`git-branch-item ${b.current ? "current" : ""}`}>
      <span className={`git-branch-indicator ${b.current ? "current" : ""}`}>
        {b.current ? "●" : "○"}
      </span>
      <span className={`git-branch-name ${b.current ? "current" : ""}`}>
        {b.name.replace("remotes/", "")}
      </span>
      {b.last_commit && <span className="git-branch-date">{b.last_commit}</span>}
      {!b.current && (
        <div className="git-branch-actions">
          <button className="btn-xs" onClick={() => handleSwitch(b.name)}>Switch</button>
          <button className="btn-xs" onClick={() => setMergeTarget(b.name)}>Merge</button>
        </div>
      )}
      {mergeTarget === b.name && (
        <div className="git-merge-confirm">
          Merge <strong>{b.name}</strong> into <strong>{current}</strong>?
          <button className="btn-xs btn-primary" onClick={() => handleMerge(b.name)} disabled={merging}>
            {merging ? "..." : "Confirm"}
          </button>
          <button className="btn-xs" onClick={() => setMergeTarget(null)}>Cancel</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="git-branch-manager">
      <div className="git-branch-current-header">
        <span className="git-branch-current-label">Current branch</span>
        <span className="git-branch-current-name">{current}</span>
      </div>

      <input
        className="git-branch-filter"
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter branches..."
      />

      <div className="git-branch-create">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New branch name"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <BranchSelector branches={branchNames} value={startPoint} onChange={setStartPoint} placeholder="From branch" defaultOption="current" />
        <button className="btn-sm btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
          {creating ? "..." : "Create & Switch"}
        </button>
      </div>

      {/* Compare branches */}
      <div className="git-compare-section">
        <div className="git-changes-header"><span className="git-changes-title">Compare Branches</span></div>
        <div className="git-compare-row">
          <BranchSelector branches={branchNames} value={compareBase} onChange={setCompareBase} placeholder="Base branch" />
          <span style={{ color: "var(--text-dim)", fontSize: 11, flexShrink: 0 }}>vs</span>
          <BranchSelector branches={branchNames} value={compareTarget} onChange={setCompareTarget} placeholder="Target (optional)" defaultOption="current branch" />
          <button className="btn-xs btn-primary" onClick={handleCompare} disabled={comparing || !compareBase}>
            {comparing ? "..." : "Compare"}
          </button>
        </div>
        {compareResult && (
          <div className="git-compare-result">
            <div className="git-compare-stats">
              <span>⬆ {compareResult.ahead} ahead</span>
              <span>⬇ {compareResult.behind} behind</span>
              <span>📄 {compareResult.files.length} files</span>
            </div>
            {compareResult.files.length > 0 && (
              <div className="git-compare-files">
                {compareResult.files.map((f) => (
                  <div key={f.file} className="git-compare-file">
                    <span className={`git-status-badge`} style={{
                      color: f.status === "A" ? "var(--accent-green)" : f.status === "D" ? "var(--danger)" : "var(--accent-blue)"
                    }}>{f.status}</span>
                    <span className="git-change-file">{f.file}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="git-branch-list">
        {loading && <div className="git-branch-loading">Loading...</div>}
        {!loading && localBranches.map(renderBranch)}
        {remoteBranches.length > 0 && (
          <>
            <div className="git-branch-section-title">Remote</div>
            {remoteBranches.map(renderBranch)}
          </>
        )}
      </div>
    </div>
  );
}
