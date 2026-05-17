import { useEffect, useState } from "react";
import { fetchGitBranches, fetchGitCompare, gitCheckout, gitCreateBranch, gitMerge, fetchGitTags, gitCreateTag, gitDeleteTag, fetchGitLogDetail } from "../lib/api";
import type { GitBranch, GitCompareResult, GitTag, GitLogEntry } from "../lib/api";
import { useGit } from "../GitContext";
import BranchSelector from "./BranchSelector";

export default function BranchManager() {
  const { repoRoot, refresh, addConsole } = useGit();
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
  const [tags, setTags] = useState<GitTag[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagMsg, setTagMsg] = useState("");
  const [tagCommit, setTagCommit] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [networkEntries, setNetworkEntries] = useState<GitLogEntry[]>([]);
  const [loadingNetwork, setLoadingNetwork] = useState(false);

  const loadTags = async () => {
    setLoadingTags(true);
    try {
      const data = await fetchGitTags(repoRoot);
      setTags(data.tags);
    } catch { setTags([]); }
    finally { setLoadingTags(false); }
  };

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
      addConsole("checkout", `Switched to ${name}`);
      refresh();
    } catch (e: any) { addConsole("checkout", `Error: ${e.message}`); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await gitCreateBranch(repoRoot, newName.trim(), startPoint || undefined, true);
      addConsole("create-branch", `Created and switched to ${newName}`);
      setNewName("");
      refresh();
    } catch (e: any) { addConsole("create-branch", `Error: ${e.message}`); }
    finally { setCreating(false); }
  };

  const handleMerge = async (branch: string) => {
    setMerging(true);
    try {
      await gitMerge(repoRoot, branch);
      addConsole("merge", `Merged ${branch} into ${current}`);
      setMergeTarget(null);
      refresh();
    } catch (e: any) { addConsole("merge", `Error: ${e.message}`); }
    finally { setMerging(false); }
  };

  const handleCompare = async () => {
    if (!compareBase) return;
    setComparing(true);
    setCompareResult(null);
    try {
      const r = await fetchGitCompare(repoRoot, compareBase, compareTarget || undefined);
      setCompareResult(r);
      addConsole("compare", `${r.base} vs ${r.target}: ${r.ahead} ahead, ${r.behind} behind, ${r.files.length} files changed`);
    } catch (e: any) { addConsole("compare", `Error: ${e.message}`); }
    finally { setComparing(false); }
  };

  const handleCreateTag = async () => {
    if (!tagName.trim()) return;
    setCreatingTag(true);
    try {
      await gitCreateTag(repoRoot, tagName.trim(), tagMsg, tagCommit);
      addConsole("create-tag", `Created tag ${tagName}`);
      setTagName("");
      setTagMsg("");
      setTagCommit("");
      loadTags();
    } catch (e: any) { addConsole("create-tag", `Error: ${e.message}`); }
    finally { setCreatingTag(false); }
  };

  const handleDeleteTag = async (name: string) => {
    try {
      await gitDeleteTag(repoRoot, name);
      addConsole("delete-tag", `Deleted tag ${name}`);
      loadTags();
    } catch (e: any) { addConsole("delete-tag", `Error: ${e.message}`); }
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

      {/* Tags section */}
      <div className="git-tags-section">
        <button className="git-tags-toggle" onClick={() => { if (!tagsOpen) loadTags(); setTagsOpen(!tagsOpen); }}>
          <span>{tagsOpen ? "▼" : "▶"} Tags ({tags.length})</span>
        </button>
        {tagsOpen && (
          <div className="git-tags-body">
            <div className="git-tags-create">
              <input type="text" value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="Tag name" />
              <input type="text" value={tagMsg} onChange={(e) => setTagMsg(e.target.value)} placeholder="Message (optional)" />
              <input type="text" value={tagCommit} onChange={(e) => setTagCommit(e.target.value)} placeholder="Commit hash (optional)" />
              <button className="btn-sm btn-primary" onClick={handleCreateTag} disabled={creatingTag || !tagName.trim()}>
                {creatingTag ? "..." : "Create Tag"}
              </button>
            </div>
            {loadingTags && <div className="git-tags-loading" style={{ color: "var(--text-dim)", fontSize: 12, padding: "4px 8px" }}>Loading...</div>}
            {!loadingTags && tags.length === 0 && <div className="git-tags-empty" style={{ color: "var(--text-dim)", fontSize: 12, padding: "4px 8px" }}>No tags</div>}
            {tags.map((t) => (
              <div key={t.name} className="git-tag-item">
                <span className="git-tag-name">{t.name}</span>
                <span className="git-tag-meta">{t.commit} {t.date ? `· ${t.date}` : ""}</span>
                {t.message && <span className="git-tag-msg">{t.message}</span>}
                <button className="btn-xs btn-danger" onClick={() => handleDeleteTag(t.name)} title="Delete tag">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Network view */}
      <div className="git-network-section">
        <button className="git-network-toggle" onClick={() => {
          if (!networkOpen) {
            setLoadingNetwork(true);
            setNetworkOpen(true);
            fetchGitLogDetail(repoRoot, 30, 0)
              .then((d) => setNetworkEntries(d.commits))
              .catch(() => setNetworkEntries([]))
              .finally(() => setLoadingNetwork(false));
          } else {
            setNetworkOpen(false);
          }
        }}>
          <span>{networkOpen ? "▼" : "▶"} Network</span>
        </button>
        {networkOpen && (
          <div className="git-network-body">
            {loadingNetwork && <div className="git-network-loading" style={{ color: "var(--text-dim)", fontSize: 11, padding: 6 }}>Loading...</div>}
            {!loadingNetwork && networkEntries.length === 0 && <div className="git-network-empty" style={{ color: "var(--text-dim)", fontSize: 11, padding: 6 }}>No commits</div>}
            {!loadingNetwork && networkEntries.map((c, i) => {
              const colors = ["var(--accent-green)", "var(--accent-blue)", "var(--primary)", "var(--danger)", "var(--text)"];
              const branchColor = colors[i % colors.length];
              return (
                <div key={c.hash} className="git-network-item">
                  <span className="git-network-graph" style={{ color: branchColor }}>{c.graph_line}</span>
                  <span className="git-network-hash">{c.hash}</span>
                  <span className="git-network-msg">{c.message.length > 30 ? c.message.substring(0, 30) + "…" : c.message}</span>
                  <span className="git-network-time">{c.time}</span>
                </div>
              );
            })}
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
