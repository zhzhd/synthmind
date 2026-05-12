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
}

export interface ChatResponse {
  message: string;
  thread_id: string;
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
): Promise<ApprovalResponse> {
  const res = await fetch(`${API_BASE}/api/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pending_id: pendingId,
      decision,
      edited_args: editedArgs,
    }),
  });
  if (!res.ok) throw new Error(`Approval failed: ${res.statusText}`);
  return res.json();
}

// ── Thread history ────────────────────────────────────

export interface ThreadMessage {
  role: string;
  content: string;
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
