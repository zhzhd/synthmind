import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { fetchGitInfo, fetchGitStatus, gitPull, gitPush, gitFetch, gitStash, fetchThreadWorkdir } from "./lib/api";
import type { GitStatusEntry } from "./lib/api";

interface ConsoleEntry {
  command: string;
  output: string;
  timestamp: number;
}

interface GitContextValue {
  repoRoot: string;
  branch: string;
  refType: string;
  statusEntries: GitStatusEntry[];
  consoleEntries: ConsoleEntry[];
  loading: boolean;

  setRepoRoot: (path: string) => void;
  refresh: () => Promise<void>;
  addConsole: (command: string, output: string) => void;
  clearConsole: () => void;

  handlePull: () => Promise<void>;
  handlePush: () => Promise<void>;
  handleFetch: () => Promise<void>;
  handleStash: () => Promise<void>;

  view: "changes" | "log" | "branches";
  setView: (v: "changes" | "log" | "branches") => void;
  consoleOpen: boolean;
  setConsoleOpen: (v: boolean) => void;
}

const GitContext = createContext<GitContextValue | null>(null);

export function useGit(): GitContextValue {
  const ctx = useContext(GitContext);
  if (!ctx) throw new Error("useGit must be used within GitProvider");
  return ctx;
}

export function GitProvider({ threadId, children }: { threadId?: string; children: ReactNode }) {
  const [repoRoot, setRepoRoot] = useState("");
  const [branch, setBranch] = useState("");
  const [refType, setRefType] = useState("branch");
  const [statusEntries, setStatusEntries] = useState<GitStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"changes" | "log" | "branches">("changes");
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);

  const addConsole = useCallback((command: string, output: string) => {
    setConsoleEntries((prev) => [...prev, { command, output, timestamp: Date.now() }]);
  }, []);

  const clearConsole = useCallback(() => setConsoleEntries([]), []);

  const refresh = useCallback(async () => {
    if (!repoRoot) return;
    try {
      const info = await fetchGitInfo(repoRoot);
      setBranch(info.branch || "");
      setRefType(info.ref_type || "branch");
      if (info.is_repo) {
        const status = await fetchGitStatus(repoRoot);
        setStatusEntries(status.entries);
      } else {
        setStatusEntries([]);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [repoRoot]);

  // Fetch workdir from thread
  useEffect(() => {
    if (!threadId) return;
    fetchThreadWorkdir(threadId)
      .then((r) => { if (r.workdir) setRepoRoot(r.workdir); })
      .catch(() => {});
  }, [threadId]);

  useEffect(() => {
    if (repoRoot) refresh();
  }, [repoRoot, refresh]);

  const handlePull = useCallback(async () => {
    try { const r = await gitPull(repoRoot); addConsole(r.command || "pull", r.stdout || r.stderr || ""); refresh(); }
    catch (e: any) { addConsole("pull", `Error: ${e.message}`); }
  }, [repoRoot, addConsole, refresh]);

  const handlePush = useCallback(async () => {
    try { const r = await gitPush(repoRoot); addConsole(r.command || "push", r.stdout || r.stderr || ""); refresh(); }
    catch (e: any) { addConsole("push", `Error: ${e.message}`); }
  }, [repoRoot, addConsole, refresh]);

  const handleFetch = useCallback(async () => {
    try { const r = await gitFetch(repoRoot); addConsole(r.command || "fetch", r.stdout || r.stderr || ""); refresh(); }
    catch (e: any) { addConsole("fetch", `Error: ${e.message}`); }
  }, [repoRoot, addConsole, refresh]);

  const handleStash = useCallback(async () => {
    try { const r = await gitStash(repoRoot, "push", "WIP"); addConsole(r.command || "stash", r.stdout || r.stderr || ""); refresh(); }
    catch (e: any) { addConsole("stash", `Error: ${e.message}`); }
  }, [repoRoot, addConsole, refresh]);

  return (
    <GitContext.Provider value={{
      repoRoot, branch, refType, statusEntries, consoleEntries, loading,
      setRepoRoot, refresh, addConsole, clearConsole,
      handlePull, handlePush, handleFetch, handleStash,
      view, setView, consoleOpen, setConsoleOpen,
    }}>
      {children}
    </GitContext.Provider>
  );
}

export type { ConsoleEntry };
