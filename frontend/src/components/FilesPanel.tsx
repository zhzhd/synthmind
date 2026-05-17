import { useEffect, useState, useCallback, useRef } from "react";
import { fetchFiles, fetchFileContent, saveFileContent, fetchFIMComplete, fetchThreadWorkdir, fetchGitInfo, fetchGitStatus, gitCommit, gitCheckout, fetchGitBranches } from "../lib/api";
import type { FileEntry, GitStatusEntry } from "../lib/api";
import { useTranslation } from "../useLanguage";

interface Props {
  threadId?: string;
}

const GIT_STATUS_COLORS: Record<string, string> = {
  modified: "var(--accent-blue)",
  added: "var(--accent-green)",
  deleted: "var(--danger)",
  untracked: "var(--text-dim)",
  renamed: "var(--accent-blue)",
  copied: "var(--accent-blue)",
  changed: "var(--accent-blue)",
};

export default function FilesPanel({ threadId }: Props) {
  const { t } = useTranslation();
  const [rootPath, setRootPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [fimLoading, setFimLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Record<string, FileEntry[]>>({});

  // Git state
  const [gitInfo, setGitInfo] = useState<{ is_repo: boolean; branch?: string; repo_root?: string }>({ is_repo: false });
  const [gitStatus, setGitStatus] = useState<GitStatusEntry[]>([]);
  const [gitStatusMap, setGitStatusMap] = useState<Record<string, GitStatusEntry>>({});
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [branches, setBranches] = useState<{ name: string; current: boolean }[]>([]);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showCommitInput, setShowCommitInput] = useState(false);

  console.log("[FilesPanel] render", { threadId, rootPath, entries: entries.length, loading, error, gitInfo });

  // Load workdir → list files → check git
  useEffect(() => {
    if (!threadId) { return; }
    setLoading(true);
    setError("");
    fetchThreadWorkdir(threadId)
      .then((r) => {
        const dir = r.workdir || ".";
        setRootPath(dir);
        // Auto-expand root
        setExpandedDirs((prev) => new Set(prev).add(dir));
        return Promise.all([
          fetchFiles(dir),
          fetchGitInfo(dir).then((info) => {
            console.log("[FilesPanel] git info:", info);
            setGitInfo(info);
            if (info.is_repo && info.repo_root) {
              return fetchGitStatus(info.repo_root).then((s) => {
                console.log("[FilesPanel] git status entries:", s.entries.length);
                setGitStatus(s.entries);
                const map: Record<string, GitStatusEntry> = {};
                for (const e of s.entries) map[e.file] = e;
                setGitStatusMap(map);
              });
            }
            return null;
          }),
        ]);
      })
      .then(([filesData]) => {
        setEntries(filesData.entries);
        setDirContents({ [filesData.path]: filesData.entries });
      })
      .catch((e) => {
        console.warn("[FilesPanel] error:", e);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [threadId]);

  const loadDir = useCallback(async (dirPath: string) => {
    if (dirContents[dirPath]) return;
    try {
      const data = await fetchFiles(dirPath);
      setDirContents((prev) => ({ ...prev, [data.path]: data.entries }));
    } catch (e: any) {
      console.warn("Failed to load dir:", e.message);
    }
  }, [dirContents]);

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else { next.add(dirPath); loadDir(dirPath); }
      return next;
    });
  };

  const handleFileClick = async (filePath: string) => {
    setSelectedFile(filePath);
    setFileLoading(true);
    setEditing(false);
    try {
      const data = await fetchFileContent(filePath);
      setFileContent(data.content);
      setEditContent(data.content);
    } catch (e: any) {
      setFileContent(`Error: ${e.message}`);
      setEditContent(`Error: ${e.message}`);
    } finally {
      setFileLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await saveFileContent(selectedFile, editContent);
      setFileContent(editContent);
      setEditing(false);
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(fileContent);
    setEditing(false);
  };

  const handleFIMComplete = async () => {
    const ta = textareaRef.current;
    if (!ta || fimLoading) return;
    const cursorPos = ta.selectionStart;
    const before = editContent.slice(0, cursorPos);
    const cursorLine = before.split("\n").length - 1;
    const cursorColumn = before.split("\n").pop()?.length || 0;

    setFimLoading(true);
    try {
      const completion = await fetchFIMComplete(editContent, cursorLine, cursorColumn);
      if (!completion) return;
      // Insert completion at cursor position
      const newContent = editContent.slice(0, cursorPos) + completion + editContent.slice(cursorPos);
      setEditContent(newContent);
      // Restore cursor position after insert (on next tick via ref)
      const newPos = cursorPos + completion.length;
      // Use setTimeout to run after React re-render
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newPos;
          textareaRef.current.selectionEnd = newPos;
          textareaRef.current.focus();
        }
      }, 0);
    } catch (e: any) {
      alert(`FIM completion failed: ${e.message}`);
    } finally {
      setFimLoading(false);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileGitStatus = (filePath: string): GitStatusEntry | undefined => {
    if (!gitInfo.is_repo || !gitInfo.repo_root) return undefined;
    const relPath = filePath.startsWith(gitInfo.repo_root)
      ? filePath.slice(gitInfo.repo_root.length + 1)
      : filePath;
    return gitStatusMap[relPath];
  };

  const getStatusColor = (status?: string): string | undefined => {
    return status ? GIT_STATUS_COLORS[status] : undefined;
  };

  // Compute aggregated git status for a directory based on its children
  const getDirGitStatus = (dirPath: string): string | undefined => {
    if (!gitInfo.is_repo) return undefined;
    const prefix = dirPath.startsWith(gitInfo.repo_root!)
      ? dirPath.slice(gitInfo.repo_root!.length + 1) + "/"
      : dirPath + "/";
    const priority = ["modified", "deleted", "added", "renamed", "copied", "changed", "untracked"];
    let best: string | undefined;
    for (const [relPath, entry] of Object.entries(gitStatusMap)) {
      if (relPath.startsWith(prefix) || relPath === prefix.slice(0, -1)) {
        const idx = priority.indexOf(entry.status);
        if (idx !== -1 && (best === undefined || idx < priority.indexOf(best))) {
          best = entry.status;
        }
      }
    }
    return best;
  };

  const renderEntry = (entry: FileEntry, depth: number = 0) => {
    const isExpanded = expandedDirs.has(entry.path);
    const gitStatus = getFileGitStatus(entry.path);
    const dirStatus = entry.is_dir ? getDirGitStatus(entry.path) : undefined;
    const effectiveStatus = gitStatus?.status || dirStatus;
    const statusColor = getStatusColor(effectiveStatus);

    if (entry.is_dir) {
      const children = dirContents[entry.path] || [];
      return (
        <div key={entry.path}>
          <div
            className={`file-tree-item ${statusColor ? "has-git-status" : ""}`}
            style={{
              paddingLeft: 12 + depth * 16,
              ...(statusColor ? { borderLeft: `3px solid ${statusColor}`, paddingLeft: 9 + depth * 16 } : {}),
            }}
            onClick={() => toggleDir(entry.path)}
          >
            <span className="file-tree-icon">{isExpanded ? "📂" : "📁"}</span>
            <span className="file-tree-name">{entry.name}</span>
            {effectiveStatus && (
              <span className={`file-status-badge status-${effectiveStatus}`} title={effectiveStatus}>
                {effectiveStatus === "modified" ? "M" : effectiveStatus === "added" ? "A" : effectiveStatus === "deleted" ? "D" : effectiveStatus === "untracked" ? "?" : "~"}
              </span>
            )}
          </div>
          {isExpanded && children.map((child) => renderEntry(child, depth + 1))}
          {isExpanded && children.length === 0 && (
            <div className="file-tree-item file-tree-empty" style={{ paddingLeft: 28 + depth * 16 }}>(empty)</div>
          )}
        </div>
      );
    }

    const rowStyle: React.CSSProperties = {
      paddingLeft: 12 + depth * 16,
    };
    if (statusColor) {
      rowStyle.borderLeft = `3px solid ${statusColor}`;
      rowStyle.paddingLeft = 9 + depth * 16;
    }

    return (
      <div
        key={entry.path}
        className={`file-tree-item ${selectedFile === entry.path ? "selected" : ""} ${statusColor ? "has-git-status" : ""}`}
        style={rowStyle}
        onClick={() => handleFileClick(entry.path)}
      >
        <span className="file-tree-icon">{getFileIcon(entry.name)}</span>
        <span className="file-tree-name" style={statusColor ? { color: statusColor } : undefined}>{entry.name}</span>
        {gitStatus && (
          <span className={`file-status-badge status-${gitStatus.status}`} title={gitStatus.status}>
            {gitStatus.status === "modified" ? "M" : gitStatus.status === "added" ? "A" : gitStatus.status === "deleted" ? "D" : gitStatus.status === "untracked" ? "?" : gitStatus.status === "renamed" ? "R" : "~"}
          </span>
        )}
        {gitStatus?.staged && <span className="file-tree-git-staged" title="Staged">●</span>}
        <span className="file-tree-size">{formatSize(entry.size)}</span>
      </div>
    );
  };

  const handleCommit = async () => {
    if (!commitMsg.trim() || !gitInfo.repo_root) return;
    setCommitting(true);
    try {
      await gitCommit(gitInfo.repo_root, commitMsg.trim());
      setCommitMsg("");
      setShowCommitInput(false);
      // Refresh status
      const s = await fetchGitStatus(gitInfo.repo_root);
      setGitStatus(s.entries);
      const map: Record<string, GitStatusEntry> = {};
      for (const e of s.entries) map[e.file] = e;
      setGitStatusMap(map);
    } catch (e: any) {
      alert(`Commit failed: ${e.message}`);
    } finally {
      setCommitting(false);
    }
  };

  const handleBranchSwitch = async (branch: string) => {
    if (!gitInfo.repo_root) return;
    try {
      await gitCheckout(gitInfo.repo_root, branch);
      // Refresh
      const info = await fetchGitInfo(gitInfo.repo_root);
      setGitInfo(info);
      const s = await fetchGitStatus(gitInfo.repo_root);
      setGitStatus(s.entries);
      const map: Record<string, GitStatusEntry> = {};
      for (const e of s.entries) map[e.file] = e;
      setGitStatusMap(map);
      setShowBranchPicker(false);
    } catch (e: any) {
      alert(`Checkout failed: ${e.message}`);
    }
  };

  const openBranchPicker = async () => {
    if (!gitInfo.repo_root) return;
    try {
      const data = await fetchGitBranches(gitInfo.repo_root);
      setBranches(data.branches);
      setShowBranchPicker(true);
    } catch (e: any) {
      alert(`Failed to load branches: ${e.message}`);
    }
  };

  const changedCount = gitStatus.length;

  return (
    <div className="files-panel">
      <div className="files-panel-header">
        <span className="files-panel-title">{t("files.title")}</span>
        {rootPath && <span className="files-panel-path">{rootPath}</span>}
        {gitInfo.is_repo && gitInfo.branch && (
          <div className="git-bar">
            <button className="git-branch-btn" onClick={openBranchPicker} title={t("files.switch_branch")}>
              ⎇ {gitInfo.branch}
            </button>
            {changedCount > 0 && (
              <span className="git-changed-count" title={`${changedCount} file(s) changed`}>
                {changedCount} ✎
              </span>
            )}
            {changedCount > 0 && !showCommitInput && (
              <button className="git-action-btn" onClick={() => setShowCommitInput(true)} title="Commit">✓</button>
            )}
          </div>
        )}
        {showBranchPicker && (
          <div className="git-branch-picker">
            {branches.map((b) => (
              <button
                key={b.name}
                className={`git-branch-option ${b.current ? "active" : ""}`}
                onClick={() => handleBranchSwitch(b.name)}
              >
                {b.current ? "● " : ""}{b.name}
              </button>
            ))}
            <button className="git-branch-close" onClick={() => setShowBranchPicker(false)}>Close</button>
          </div>
        )}
        {showCommitInput && (
          <div className="git-commit-row">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit message"
              onKeyDown={(e) => e.key === "Enter" && handleCommit()}
              autoFocus
            />
            <button className="btn-xs btn-primary" onClick={handleCommit} disabled={committing || !commitMsg.trim()}>
              {committing ? "..." : "Commit"}
            </button>
            <button className="btn-xs" onClick={() => { setShowCommitInput(false); setCommitMsg(""); }}>✕</button>
          </div>
        )}
      </div>

      {gitInfo.is_repo && gitStatus.length > 0 && (
        <div className="git-status-legend">
          {Object.entries(GIT_STATUS_COLORS).map(([status, color]) => {
            const hasStatus = gitStatus.some(e => e.status === status);
            if (!hasStatus) return null;
            const label = status === "modified" ? "Modified" : status === "added" ? "Added" : status === "deleted" ? "Deleted" : status === "untracked" ? "Untracked" : status === "renamed" ? "Renamed" : status;
            return (
              <span key={status} className="git-status-legend-item" style={{ color }}>
                <span className="git-status-legend-dot" style={{ background: color }} />
                {label}
              </span>
            );
          })}
        </div>
      )}

      <div className="files-panel-body">
        <div className="files-tree">
          {loading && <div className="files-loading">{t("files.loading")}</div>}
          {error && <div className="files-error">{error}</div>}
          {!loading && !error && rootPath && (
            <div>
              <div className="file-tree-item file-tree-root" onClick={() => toggleDir(rootPath)}>
                <span className="file-tree-icon">{expandedDirs.has(rootPath) ? "📂" : "📁"}</span>
                <span className="file-tree-name">{rootPath.split("/").pop() || rootPath}</span>
              </div>
              {expandedDirs.has(rootPath) && entries.map((e) => renderEntry(e, 1))}
              {expandedDirs.has(rootPath) && entries.length === 0 && (
                <div className="file-tree-empty" style={{ paddingLeft: 28 }}>(empty)</div>
              )}
            </div>
          )}
          {!loading && !rootPath && (
            <div className="files-empty">{t("files.empty")}</div>
          )}
        </div>

        {selectedFile && (
          <div className="file-viewer">
            <div className="file-viewer-header">
              <span className="file-viewer-name">{selectedFile.split("/").pop()}</span>
              {!fileLoading && !editing && (
                <button className="btn-xs" style={{ marginLeft: "auto" }} onClick={() => setEditing(true)}>{t("files.edit")}</button>
              )}
              {editing && (
                <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                  <button
                    className="btn-xs fim-btn"
                    onClick={handleFIMComplete}
                    disabled={fimLoading}
                    title={t("files.fim_title")}
                  >
                    {fimLoading ? "..." : "⟡ FIM"}
                  </button>
                  <button className="btn-xs btn-primary" onClick={handleSaveEdit} disabled={saving}>
                    {saving ? t("files.saving") : t("files.save")}
                  </button>
                  <button className="btn-xs" onClick={handleCancelEdit}>{t("files.cancel")}</button>
                </div>
              )}
            </div>
            {fileLoading ? (
              <pre className="file-viewer-content">Loading...</pre>
            ) : editing ? (
              <textarea
                ref={textareaRef}
                className="file-viewer-editor"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  // Ctrl+Space triggers FIM completion
                  if (e.key === " " && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleFIMComplete();
                  }
                }}
                spellCheck={false}
              />
            ) : (
              <pre className="file-viewer-content">{fileContent}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconMap: Record<string, string> = {
    ts: "🔷", tsx: "⚛️", js: "🟨", jsx: "⚛️", py: "🐍",
    json: "📋", yaml: "📋", yml: "📋", md: "📝", txt: "📄",
    css: "🎨", html: "🌐", sql: "🗃️", sh: "💻", toml: "⚙️",
    lock: "🔒", gitignore: "🙈", env: "🔐",
  };
  return iconMap[ext] || "📄";
}
