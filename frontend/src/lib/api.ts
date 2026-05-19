/** API client for the SynthMind backend. */

export interface ModelInfo {
  provider: string;
  model: string;
  available: boolean;
}

export interface ModelConfig {
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  api_key?: string;
  base_url?: string;
  reasoning_effort?: string;
}

export interface ChatResponse {
  type: "response";
  message: string;
  thread_id: string;
  reasoning_content?: string;
}

// ── Tracing / Observability ──────────────────────────

export interface TraceEntry {
  id: string;
  thread_id: string;
  type: "llm" | "tool" | "error";
  model: string;
  name: string;
  input_preview: string;
  output_preview: string;
  token_usage: Record<string, number>;
  latency_ms: number;
  timestamp: number;
  error: string | null;
}

export async function fetchTraces(threadId?: string): Promise<TraceEntry[]> {
  const params = threadId ? `?thread_id=${encodeURIComponent(threadId)}` : "";
  const res = await fetch(`${API_BASE}/api/traces${params}`);
  if (!res.ok) throw new Error(`Failed to fetch traces: ${res.statusText}`);
  const data = await res.json();
  return data.traces || [];
}

// ── Tool whitelist ────────────────────────────────────

export async function fetchWhitelist(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/whitelist`);
  if (!res.ok) throw new Error(`Failed to fetch whitelist: ${res.statusText}`);
  const data = await res.json();
  return data.whitelist;
}

export async function addToWhitelist(toolName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/whitelist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool_name: toolName }),
  });
  if (!res.ok) throw new Error(`Failed to add to whitelist: ${res.statusText}`);
}

export async function removeFromWhitelist(toolName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/whitelist/${encodeURIComponent(toolName)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to remove from whitelist: ${res.statusText}`);
}

// ── Thread working directory ──────────────────────────

export interface WorkdirResponse {
  thread_id: string;
  workdir: string | null;
}

export async function fetchThreadWorkdir(threadId: string): Promise<WorkdirResponse> {
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(threadId)}/workdir`);
  if (!res.ok) throw new Error(`Failed to fetch workdir: ${res.statusText}`);
  return res.json();
}

export async function setThreadWorkdir(threadId: string, workdir: string): Promise<WorkdirResponse> {
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(threadId)}/workdir`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workdir }),
  });
  if (!res.ok) throw new Error(`Failed to set workdir: ${res.statusText}`);
  return res.json();
}

export async function pickFolder(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/pick-folder`, { method: "POST" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.path || null;
  } catch {
    return null;
  }
}

// ── Provider configuration types ──────────────────────

export interface ProviderConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
}

export interface TestResult {
  ok: boolean;
  response?: string;
  error?: string;
}

// ── Base URL ──────────────────────────────────────────

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const API_BASE = isTauri ? "http://127.0.0.1:8000" : "";

// ── Chat & models ─────────────────────────────────────

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_BASE}/api/models`);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.statusText}`);
  const data = await res.json();
  return data.models;
}

export async function sendMessage(
  message: string,
  modelConfig: ModelConfig,
  threadId?: string,
): Promise<ChatResponse | ApprovalResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      llm_config: modelConfig,
      thread_id: threadId,
    }),
  });
  if (!res.ok) throw new Error(`Chat request failed: ${res.statusText}`);
  return res.json();
}

// ── Feishu config ────────────────────────────────────

export interface FeishuConfig {
  app_id: string;
  app_secret: string;
  bot_name: string;
  has_secret?: boolean;
}

export async function fetchFeishuConfig(): Promise<FeishuConfig> {
  const res = await fetch(`${API_BASE}/api/feishu-config`);
  if (!res.ok) throw new Error(`Failed to fetch feishu config: ${res.statusText}`);
  return res.json();
}

export async function updateFeishuConfig(cfg: Partial<FeishuConfig>): Promise<void> {
  const res = await fetch(`${API_BASE}/api/feishu-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error(`Failed to update feishu config: ${res.statusText}`);
}

// ── Balance ──────────────────────────────────────────

export interface BalanceInfo {
  currency: string;
  total_balance: string;
  is_available: boolean;
}

export async function fetchBalance(): Promise<BalanceInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/api/balance`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.balance || null;
  } catch {
    return null;
  }
}

// ── Git ─────────────────────────────────────────────

export interface GitInfo {
  is_repo: boolean;
  repo_root?: string;
  branch?: string;
  ref_type?: string;
}

export interface GitStatusEntry {
  file: string;
  status: string;
  staged: boolean;
}

export interface GitStatus {
  entries: GitStatusEntry[];
  branch: string;
  repo_root: string;
}

export interface GitFileDiff {
  file: string;
  diff: string;
}

export interface GitCommandResult {
  command?: string;
  stdout?: string;
  stderr?: string;
  ok?: boolean;
  hash?: string;
}

export interface GitLogEntry {
  hash: string;
  hash_full: string;
  author: string;
  message: string;
  time: string;
  refs: string;
  graph_line: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  last_commit?: string;
}

// ── Functions ──

export async function fetchGitInfo(path: string): Promise<GitInfo> {
  const res = await fetch(`${API_BASE}/api/git/info?path=${encodeURIComponent(path)}`);
  if (!res.ok) return { is_repo: false };
  return res.json();
}

export async function fetchGitStatus(path: string): Promise<GitStatus> {
  const res = await fetch(`${API_BASE}/api/git/status?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Failed to fetch git status: ${res.statusText}`);
  return res.json();
}

export async function gitCommit(path: string, message: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/git/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, message }),
  });
  if (!res.ok) throw new Error(`Commit failed: ${res.statusText}`);
}

export async function gitCheckout(path: string, branch: string, create = false): Promise<void> {
  const res = await fetch(`${API_BASE}/api/git/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, branch, create }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const b = await res.text(); if (b) msg = b; } catch {}
    throw new Error(msg);
  }
}

export async function fetchGitBranches(path: string): Promise<{ branches: GitBranch[]; current: string }> {
  const res = await fetch(`${API_BASE}/api/git/branches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(`Failed to fetch branches: ${res.statusText}`);
  return res.json();
}

// New functions

export async function fetchGitDiff(path: string, file?: string, cached?: boolean): Promise<{ diff?: string; diffs?: GitFileDiff[]; file?: string }> {
  const params = `path=${encodeURIComponent(path)}${file ? `&file=${encodeURIComponent(file)}` : ""}${cached ? "&cached=true" : ""}`;
  const res = await fetch(`${API_BASE}/api/git/diff?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch diff: ${res.statusText}`);
  return res.json();
}

export async function gitStageAll(path: string): Promise<GitCommandResult> {
  return gitStage(path, ["."]);
}

export async function gitUnstageAll(path: string): Promise<GitCommandResult> {
  return gitUnstage(path, ["."]);
}

export async function gitStage(path: string, files?: string[]): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/stage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, files: files || [] }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitUnstage(path: string, files?: string[]): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/unstage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, files: files || [] }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitCommitStaged(path: string, message: string, author?: string): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/commit-staged`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, message, author: author || "" }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitDiscard(path: string, files: string[]): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/discard`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, files }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitPull(path: string, rebase?: boolean, remote?: string, branch?: string): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/pull`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, rebase: rebase || false, remote: remote || "", branch: branch || "" }),
  });
  return res.json();
}

export async function gitPush(path: string, remote?: string, branch?: string): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/push`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, remote: remote || "", branch: branch || "" }),
  });
  return res.json();
}

export async function gitFetch(path: string): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/fetch`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  return res.json();
}

export async function gitMerge(path: string, branch: string): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/merge`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, branch }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitStash(path: string, action: string, message?: string, index?: number): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/stash`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, action, message: message || "", index: index || 0 }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitCreateBranch(path: string, name: string, startPoint?: string, switch_: boolean = true): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/create-branch`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, name, start_point: startPoint || "", switch: switch_ }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchGitLogDetail(path: string, count = 20, skip = 0): Promise<{ commits: GitLogEntry[] }> {
  const res = await fetch(`${API_BASE}/api/git/log/detail?path=${encodeURIComponent(path)}&count=${count}&skip=${skip}`);
  if (!res.ok) throw new Error(`Failed to fetch log: ${res.statusText}`);
  return res.json();
}

export interface CommitFileEntry {
  file: string;
  status: string;
  status_raw: string;
}

export interface CommitDetail {
  files: CommitFileEntry[];
  diff: string;
}

export async function fetchGitCommitDetail(path: string, commit: string): Promise<CommitDetail> {
  const res = await fetch(`${API_BASE}/api/git/commit-detail?path=${encodeURIComponent(path)}&commit=${encodeURIComponent(commit)}`);
  if (!res.ok) throw new Error(`Failed to fetch commit detail: ${res.statusText}`);
  return res.json();
}

export interface CommitFileDiff {
  file: string;
  diff: string;
}

export async function fetchGitCommitFileDiff(path: string, commit: string, file: string): Promise<CommitFileDiff> {
  const res = await fetch(`${API_BASE}/api/git/commit-file-diff?path=${encodeURIComponent(path)}&commit=${encodeURIComponent(commit)}&file=${encodeURIComponent(file)}`);
  if (!res.ok) throw new Error(`Failed to fetch commit file diff: ${res.statusText}`);
  return res.json();
}

export interface GitCompareResult {
  base: string;
  target: string;
  ahead: number;
  behind: number;
  files: { file: string; status: string }[];
}

export async function fetchGitCompare(path: string, base: string, target?: string): Promise<GitCompareResult> {
  const params = `path=${encodeURIComponent(path)}&base=${encodeURIComponent(base)}${target ? `&target=${encodeURIComponent(target)}` : ""}`;
  const res = await fetch(`${API_BASE}/api/git/compare?${params}`);
  if (!res.ok) throw new Error(`Compare failed: ${res.statusText}`);
  return res.json();
}

export async function fetchGitRemotes(path: string): Promise<{ remotes: { name: string; url: string }[] }> {
  const res = await fetch(`${API_BASE}/api/git/remotes?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Failed to fetch remotes: ${res.statusText}`);
  return res.json();
}

export async function gitStashList(path: string): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/stash?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Phase 2 Git operations ──────────────────────────

export interface GitTag {
  name: string;
  commit: string;
  date: string;
  message: string;
}

export async function gitCherryPick(path: string, commits: string[], noCommit = false): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/cherry-pick`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, commits, no_commit: noCommit }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitRevert(path: string, commit: string, noCommit = false): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/revert`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, commit, no_commit: noCommit }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchGitTags(path: string): Promise<{ tags: GitTag[] }> {
  const res = await fetch(`${API_BASE}/api/git/tags?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Failed to fetch tags: ${res.statusText}`);
  return res.json();
}

export async function gitCreateTag(path: string, name: string, message = "", commit = ""): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/tags`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, name, message, commit }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitDeleteTag(path: string, name: string): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/tags`, {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitRebase(path: string, onto: string, branch = ""): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/rebase`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, onto, branch }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Phase 3: Conflict & diff ─────────────────────────

export interface ConflictSegment {
  type: "ours" | "base" | "theirs" | "context";
  content: string;
}

export interface ConflictFile {
  file: string;
  segments: ConflictSegment[];
  raw_diff: string;
}

export interface ConflictsResponse {
  conflicted: ConflictFile[];
}

export interface HunkLine {
  type: "added" | "removed" | "context";
  old_ln: number | null;
  new_ln: number | null;
  text: string;
}

export interface HunkInfo {
  old_start: number;
  new_start: number;
  header: string;
  lines: HunkLine[];
}

export interface NumberedDiffResult {
  diff?: string;
  file?: string;
  hunks?: HunkInfo[];
  diffs?: { file: string; diff: string; hunks: HunkInfo[] }[];
}

export async function fetchGitConflicts(path: string): Promise<ConflictsResponse> {
  const res = await fetch(`${API_BASE}/api/git/conflicts?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Failed to fetch conflicts: ${res.statusText}`);
  return res.json();
}

export async function gitResolveConflict(path: string, file: string, strategy: "ours" | "theirs" | "manual", content = ""): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/resolve`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, file, strategy, content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchGitDiffNumbered(path: string, file?: string, cached?: boolean): Promise<NumberedDiffResult> {
  const params = `path=${encodeURIComponent(path)}&format=numbered${file ? `&file=${encodeURIComponent(file)}` : ""}${cached ? "&cached=true" : ""}`;
  const res = await fetch(`${API_BASE}/api/git/diff?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch diff: ${res.statusText}`);
  return res.json();
}

// ── Phase 4: Interactive rebase ────────────────────────

export interface RebasePlanCommit {
  hash_full: string;
  hash: string;
  author: string;
  message: string;
}

export interface RebasePlanResponse {
  commits: RebasePlanCommit[];
}

export interface RebaseStatusResponse {
  in_progress: boolean;
  onto?: string;
  dir?: string;
}

export interface RebaseAction {
  action: "pick" | "reword" | "edit" | "squash" | "fixup" | "drop";
  commit_hash: string;
  message: string;
}

export async function fetchRebasePlan(path: string, onto: string, branch?: string): Promise<RebasePlanResponse> {
  const res = await fetch(`${API_BASE}/api/git/rebase/plan`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, onto, branch: branch || "" }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitRebaseInteractive(path: string, onto: string, actions: RebaseAction[]): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/rebase/interactive`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, onto, actions }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchRebaseStatus(path: string): Promise<RebaseStatusResponse> {
  const res = await fetch(`${API_BASE}/api/git/rebase/status`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitRebaseContinue(path: string): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/rebase/continue`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function gitRebaseAbort(path: string): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/rebase/abort`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  return res.json();
}

export async function gitRebaseSkip(path: string): Promise<GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/rebase/skip`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Clone ───────────────────────────────────────────

export async function gitClone(url: string, targetDir: string, branch = ""): Promise<{ cloned_path: string } & GitCommandResult> {
  const res = await fetch(`${API_BASE}/api/git/clone`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, target_dir: targetDir, branch }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Files (workspace explorer) ──────────────────────

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
}

export interface FilesListResponse {
  entries: FileEntry[];
  path: string;
}

export interface FileContentResponse {
  content: string;
  path: string;
  size: number;
}

export async function fetchFiles(path: string): Promise<FilesListResponse> {
  const res = await fetch(`${API_BASE}/api/files?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Failed to list files: ${res.statusText}`);
  return res.json();
}

export async function fetchFileContent(path: string): Promise<FileContentResponse> {
  const res = await fetch(`${API_BASE}/api/files/content?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Failed to read file: ${res.statusText}`);
  return res.json();
}

export async function saveFileContent(path: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/files/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`Failed to save file: ${res.statusText}`);
}

export async function fetchFIMComplete(
  content: string,
  cursorLine: number,
  cursorColumn: number,
  maxTokens?: number,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/files/fim-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      cursor_line: cursorLine,
      cursor_column: cursorColumn,
      max_tokens: maxTokens || 256,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `FIM completion failed: ${res.statusText}`);
  }
  const data = await res.json();
  return data.completion;
}

export type StreamEventType = "reasoning" | "content" | "done" | "error" | "fallback";

export interface StreamEvent {
  type: StreamEventType;
  data: Record<string, unknown>;
}

/** Send a streaming chat request and invoke ``onEvent`` for each SSE event. */
export async function sendMessageStream(
  message: string,
  modelConfig: ModelConfig,
  threadId: string | undefined,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      llm_config: modelConfig,
      thread_id: threadId,
    }),
  });
  if (!res.ok) throw new Error(`Stream request failed: ${res.statusText}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // keep incomplete line

    let eventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const dataStr = line.slice(6);
        if (eventType && dataStr) {
          try {
            onEvent({ type: eventType as StreamEventType, data: JSON.parse(dataStr) });
          } catch {
            // ignore parse errors
          }
        }
        eventType = "";
      }
    }
  }
}

// ── Approval (Human-in-the-loop) ──────────────────────

export interface PendingApproval {
  pending_id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  tool_call_id: string;
  explanation?: string;
}

export interface ApprovalResponse {
  type: "response" | "approval";
  message?: string;
  thread_id: string;
  pending?: PendingApproval[];
  reasoning_content?: string;
}

export async function approveAll(
  pendingIds: string[],
  threadId: string,
): Promise<ApprovalResponse> {
  const res = await fetch(`${API_BASE}/api/approve-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pending_ids: pendingIds, thread_id: threadId }),
  });
  if (!res.ok) throw new Error(`Approve all failed: ${res.statusText}`);
  return res.json();
}

export async function approveTool(
  pendingId: string,
  decision: "approve" | "reject" | "edit",
  editedArgs?: Record<string, unknown>,
  whitelist?: boolean,
): Promise<ApprovalResponse> {
  const body: Record<string, unknown> = {
    pending_id: pendingId,
    decision,
    edited_args: editedArgs,
  };
  if (whitelist) body.whitelist = true;
  const res = await fetch(`${API_BASE}/api/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Approval failed: ${res.statusText}`);
  return res.json();
}

// ── Time Travel / Checkpoints ────────────────────────────

export interface CheckpointInfo {
  checkpoint_id: string;
  step: number;
  node: string;
  next: string[];
  total_messages: number;
  msg_preview: string;
}

export interface BranchResponse extends ApprovalResponse {
  branched_from?: string;
}

export async function fetchCheckpoints(threadId: string): Promise<CheckpointInfo[]> {
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(threadId)}/checkpoints`);
  if (!res.ok) throw new Error(`Failed to fetch checkpoints: ${res.statusText}`);
  const data = await res.json();
  return data.checkpoints || [];
}

export async function branchFromCheckpoint(
  threadId: string,
  checkpointId: string,
  message?: string,
): Promise<BranchResponse> {
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(threadId)}/branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checkpoint_id: checkpointId, message: message || "" }),
  });
  if (!res.ok) throw new Error(`Branch failed: ${res.statusText}`);
  return res.json();
}

// ── Thread list ───────────────────────────────────────

export interface ThreadInfo {
  thread_id: string;
  message_count: number;
  updated_at: number;
  preview: string;
}

export async function fetchThreads(): Promise<ThreadInfo[]> {
  const res = await fetch(`${API_BASE}/api/threads`);
  if (!res.ok) throw new Error(`Failed to fetch threads: ${res.statusText}`);
  const data = await res.json();
  return data.threads || [];
}

export async function createThread(): Promise<ThreadInfo> {
  const res = await fetch(`${API_BASE}/api/threads`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to create thread: ${res.statusText}`);
  return res.json();
}

// ── Thread history ────────────────────────────────────

export interface ThreadMessage {
  role: string;
  content: string;
  reasoning_content?: string;
}

export async function fetchThreadHistory(threadId: string): Promise<ThreadMessage[]> {
  const res = await fetch(`${API_BASE}/api/threads/${encodeURIComponent(threadId)}`);
  if (!res.ok) throw new Error(`Failed to fetch thread: ${res.statusText}`);
  const data = await res.json();
  return data.messages || [];
}

// ── Provider config management ────────────────────────

export async function fetchConfigs(): Promise<ProviderConfig[]> {
  const res = await fetch(`${API_BASE}/api/configs`);
  if (!res.ok) throw new Error(`Failed to fetch configs: ${res.statusText}`);
  const data = await res.json();
  return data.configs;
}

export async function createConfig(
  cfg: Omit<ProviderConfig, "id">,
): Promise<ProviderConfig> {
  const res = await fetch(`${API_BASE}/api/configs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error(`Failed to create config: ${res.statusText}`);
  return res.json();
}

export async function updateConfig(
  id: string,
  cfg: Omit<ProviderConfig, "id">,
): Promise<ProviderConfig> {
  const res = await fetch(`${API_BASE}/api/configs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error(`Failed to update config: ${res.statusText}`);
  return res.json();
}

export async function deleteConfig(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/configs/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete config: ${res.statusText}`);
}

export async function testConfig(
  cfg: Omit<ProviderConfig, "id">,
): Promise<TestResult> {
  const res = await fetch(`${API_BASE}/api/configs/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error(`Failed to test config: ${res.statusText}`);
  return res.json();
}

// ── Skill management ─────────────────────────────────

export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  author: string;
  active: boolean;
  path?: string;
}

export interface SkillDetail extends SkillInfo {
  instructions: string;
}

export async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await fetch(`${API_BASE}/api/skills`);
  if (!res.ok) throw new Error(`Failed to fetch skills: ${res.statusText}`);
  const data = await res.json();
  return data.skills;
}

export async function fetchSkillDetail(name: string): Promise<SkillDetail> {
  const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Failed to fetch skill: ${res.statusText}`);
  return res.json();
}

export async function createSkill(data: {
  name: string;
  description: string;
  instructions: string;
  author?: string;
  version?: string;
}): Promise<SkillInfo> {
  const res = await fetch(`${API_BASE}/api/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create skill: ${res.statusText}`);
  return res.json();
}

export async function deleteSkill(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete skill: ${res.statusText}`);
}

export async function toggleSkill(name: string, active: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}/toggle`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error(`Failed to toggle skill: ${res.statusText}`);
}

export async function installSkillFromUrl(url: string): Promise<SkillInfo> {
  const res = await fetch(`${API_BASE}/api/skills/install-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Failed to install skill: ${res.statusText}`);
  return res.json();
}

// ── Memory management ────────────────────────────────────

export interface MemoryEntry {
  id: string;
  type: "user" | "feedback" | "project" | "reference";
  content: string;
  tags: string[];
  priority: number;
  created_at: number;
  situation?: string;
  _score?: number;
}

export async function fetchMemories(type?: string): Promise<MemoryEntry[]> {
  const params = type ? `?type=${encodeURIComponent(type)}` : "";
  const res = await fetch(`${API_BASE}/api/memory${params}`);
  if (!res.ok) throw new Error(`Failed to fetch memories: ${res.statusText}`);
  const data = await res.json();
  return data.memories;
}

export async function saveMemory(data: {
  type: string;
  content: string;
  tags?: string;
  situation?: string;
  priority?: number;
}): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/api/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save memory: ${res.statusText}`);
  return res.json();
}

export async function deleteMemory(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/memory/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete memory: ${res.statusText}`);
}

// ── Sub-agent management ──────────────────────────────

export interface AgentInfo {
  name: string;
  description: string;
  version: string;
  author: string;
  tools: string[];
  model_provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  path?: string;
}

export interface AgentDetail extends AgentInfo {
  system_prompt: string;
}

export async function fetchAgents(): Promise<AgentInfo[]> {
  const res = await fetch(`${API_BASE}/api/agents`);
  if (!res.ok) throw new Error(`Failed to fetch agents: ${res.statusText}`);
  const data = await res.json();
  return data.agents;
}

export async function fetchAgentDetail(name: string): Promise<AgentDetail> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Failed to fetch agent: ${res.statusText}`);
  return res.json();
}

export async function createAgent(data: {
  name: string;
  description: string;
  tools: string[];
  system_prompt: string;
  author?: string;
  model_provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}): Promise<{ name: string }> {
  const res = await fetch(`${API_BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create agent: ${res.statusText}`);
  return res.json();
}

export async function deleteAgent(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete agent: ${res.statusText}`);
}

export async function runAgent(name: string, task: string, context?: string): Promise<{ result: string; run_id: string }> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, context: context || "" }),
  });
  if (!res.ok) throw new Error(`Failed to run agent: ${res.statusText}`);
  return res.json();
}
