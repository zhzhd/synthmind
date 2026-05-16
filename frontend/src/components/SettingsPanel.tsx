import { useEffect, useState } from "react";
import type { ProviderConfig, SkillInfo, SkillDetail, MemoryEntry } from "../lib/api";
import {
  fetchConfigs, createConfig, updateConfig, deleteConfig, testConfig,
  fetchSkills, fetchSkillDetail, createSkill, deleteSkill, toggleSkill, installSkillFromUrl,
  fetchMemories, deleteMemory, saveMemory,
  fetchWhitelist, removeFromWhitelist,
  fetchFeishuConfig, updateFeishuConfig,
} from "../lib/api";
import TracesTab from "./TracesTab";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PROVIDER_TYPES = [
  { value: "deepseek", label: "DeepSeek" },
];

const EMPTY_PROVIDER_FORM = { name: "", provider: "deepseek" as const, model: "", api_key: "", base_url: "" };
type ProviderForm = typeof EMPTY_PROVIDER_FORM;

export default function SettingsPanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<"providers" | "feishu" | "skills" | "memory" | "whitelist" | "traces">("providers");
  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal skill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div style={{ display: "flex", gap: 4 }}>
            <button className={`tab-btn ${tab === "providers" ? "active" : ""}`} onClick={() => setTab("providers")}>Providers</button>
            <button className={`tab-btn ${tab === "skills" ? "active" : ""}`} onClick={() => setTab("skills")}>Skills</button>
            <button className={`tab-btn ${tab === "memory" ? "active" : ""}`} onClick={() => setTab("memory")}>Memory</button>
            <button className={`tab-btn ${tab === "feishu" ? "active" : ""}`} onClick={() => setTab("feishu")}>Feishu</button>
            <button className={`tab-btn ${tab === "whitelist" ? "active" : ""}`} onClick={() => setTab("whitelist")}>Whitelist</button>
            <button className={`tab-btn ${tab === "traces" ? "active" : ""}`} onClick={() => setTab("traces")}>Traces</button>
          </div>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        {tab === "providers" ? <ProviderTab /> : tab === "feishu" ? <FeishuTab /> : tab === "skills" ? <SkillsTab /> : tab === "memory" ? <MemoryTab /> : tab === "whitelist" ? <WhitelistTab /> : <TracesTab />}
      </div>
    </div>
  );
}

/* ── Feishu tab ────────────────────────────────────────────────── */

function FeishuTab() {
  const [cfg, setCfg] = useState({ app_id: "", app_secret: "", bot_name: "" });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetchFeishuConfig().then((c) => {
      setCfg({ app_id: c.app_id, app_secret: c.has_secret ? "***" : "", bot_name: c.bot_name });
      setLoaded(true);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      await updateFeishuConfig(cfg);
      setResult({ ok: true, msg: "Configuration saved! Restart the backend to apply changes." });
    } catch (e: any) {
      setResult({ ok: false, msg: `Save failed: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-body" style={{ flexDirection: "column" }}>
      <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)", marginBottom: 12 }}>
        Feishu Bot Configuration
      </h3>
      {!loaded && <p style={{ fontSize: 12, color: "var(--text-dim)" }}>Loading...</p>}
      {loaded && (
        <>
          <label>App ID</label>
          <input type="text" value={cfg.app_id} onChange={(e) => setCfg({ ...cfg, app_id: e.target.value })} placeholder="cli_xxxxxxxxxxxxx" />
          <label>App Secret</label>
          <input type="password" value={cfg.app_secret} onChange={(e) => setCfg({ ...cfg, app_secret: e.target.value })} placeholder="Enter your app secret" />
          <label>Bot Name <span className="label-hint">(for @mention in groups)</span></label>
          <input type="text" value={cfg.bot_name} onChange={(e) => setCfg({ ...cfg, bot_name: e.target.value })} placeholder="Optional" />
          {result && (
            <div className={`test-result ${result.ok ? "success" : "error"}`} style={{ marginTop: 10 }}>
              {result.msg}
            </div>
          )}
          <div className="settings-form-actions" style={{ marginTop: 14 }}>
            <button className="btn-sm btn-primary" onClick={handleSave} disabled={saving || !cfg.app_id || !cfg.app_secret}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 12, lineHeight: 1.5 }}>
            After saving, restart the backend to apply changes. Make sure your Feishu app has:
            <br />- 机器人 capability enabled
            <br />- im:message permission
            <br />- im.message.receive_v1 event subscribed
            <br />- WebSocket mode (长连接)
          </p>
        </>
      )}
    </div>
  );
}

/* ── Provider tab ──────────────────────────────────────────────── */

function ProviderTab() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProviderForm>(EMPTY_PROVIDER_FORM);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => { try { setConfigs(await fetchConfigs()); } catch {} };

  const handleEdit = (cfg: ProviderConfig) => {
    setEditing(cfg.id);
    setForm({ name: cfg.name, provider: cfg.provider as any, model: cfg.model, api_key: cfg.api_key, base_url: cfg.base_url });
    setTestResult(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.model) return;
    setSaving(true);
    try {
      if (editing) await updateConfig(editing, form);
      else await createConfig(form);
      await load();
      setEditing("_saved");
      setForm(EMPTY_PROVIDER_FORM);
      setShowForm(false);
    } catch (e) { alert(`Save failed: ${e instanceof Error ? e.message : e}`); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete?")) return;
    try { await deleteConfig(id); await load(); } catch {}
  };

  const handleTest = async () => {
    if (!form.model) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testConfig(form);
      setTestResult(r.ok ? `✅ ${r.response || "OK"}` : `❌ ${r.error}`);
    } catch (e) { setTestResult(`❌ ${e instanceof Error ? e.message : e}`); }
    finally { setTesting(false); }
  };

  return (
    <div className="settings-body">
      <div className="settings-list">
        <div className="settings-list-header">
          <h3>Configured Models</h3>
          <button className="btn-sm" onClick={() => { setEditing(null); setForm(EMPTY_PROVIDER_FORM); setTestResult(null); setShowForm(true); }}>+ Add</button>
        </div>
        {configs.length === 0 && <p className="settings-empty">No configurations yet.</p>}
        {configs.map((cfg) => (
          <div key={cfg.id} className="config-card">
            <div className="config-card-info">
              <strong>{cfg.name}</strong>
              <span className="config-card-meta">{cfg.provider} / {cfg.model}</span>
            </div>
            <div className="config-card-actions">
              <button className="btn-xs" onClick={() => handleEdit(cfg)}>Edit</button>
              <button className="btn-xs btn-danger" onClick={() => handleDelete(cfg.id)}>Del</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="settings-form">
          <h3>{editing ? "Edit Model" : "Add Model"}</h3>
          <label>Display Name</label>
          <input type="text" placeholder="e.g. My Claude" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label>Provider</label>
          <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as any })}>
            {PROVIDER_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <label>Model</label>
          <input type="text" placeholder="e.g. claude-sonnet-4-20250514" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <label>API Key</label>
          <input type="password" placeholder="sk-..." value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
          <label>Base URL <span className="label-hint">(optional)</span></label>
          <input type="text" placeholder="https://api.openai.com/v1" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
          {testResult && <div className={`test-result ${testResult.startsWith("✅") ? "success" : "error"}`}>{testResult}</div>}
          <div className="settings-form-actions">
            <button className="btn-sm" onClick={handleTest} disabled={testing || !form.model}>{testing ? "Testing..." : "Test"}</button>
            <button className="btn-sm btn-primary" onClick={handleSave} disabled={saving || !form.name || !form.model}>{saving ? "Saving..." : "Save"}</button>
            <button className="btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Skills tab ────────────────────────────────────────────────── */

function SkillsTab() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selected, setSelected] = useState<SkillDetail | null>(null);
  const [installUrl, setInstallUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", instructions: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => { try { setSkills(await fetchSkills()); } catch {} };

  const handleSelect = async (name: string) => { try { setSelected(await fetchSkillDetail(name)); } catch {} };

  const handleToggle = async (name: string, active: boolean) => {
    try { await toggleSkill(name, active); await load(); } catch {}
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete skill "${name}"?`)) return;
    try { await deleteSkill(name); if (selected?.name === name) setSelected(null); await load(); } catch {}
  };

  const handleInstallUrl = async () => {
    if (!installUrl.trim()) return;
    setInstalling(true); setInstallMsg("");
    try {
      const r = await installSkillFromUrl(installUrl.trim());
      setInstallMsg(`✅ Installed: ${r.name}`); setInstallUrl(""); await load();
    } catch (e) { setInstallMsg(`❌ ${e instanceof Error ? e.message : e}`); }
    finally { setInstalling(false); }
  };

  const handleCreate = async () => {
    if (!form.name || !form.instructions) return;
    setCreating(true);
    try { await createSkill(form); setShowForm(false); setForm({ name: "", description: "", instructions: "" }); await load(); }
    catch (e) { alert(`Create failed: ${e instanceof Error ? e.message : e}`); }
    finally { setCreating(false); }
  };

  return (
    <div className="settings-body">
      <div className="settings-list">
        <div className="settings-list-header">
          <h3>Installed Skills</h3>
          <button className="btn-sm" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "+ New"}</button>
        </div>
        {skills.length === 0 && <p className="settings-empty">No skills installed.</p>}
        {skills.map((s) => (
          <div key={s.name} className="config-card">
            <div className="config-card-info" onClick={() => handleSelect(s.name)} style={{ cursor: "pointer" }}>
              <strong>{s.name}</strong>
              <span className="config-card-meta">{s.description || s.author}</span>
            </div>
            <div className="config-card-actions">
              <button className="btn-xs" onClick={() => handleToggle(s.name, !s.active)}>{s.active ? "ON" : "OFF"}</button>
              <button className="btn-xs btn-danger" onClick={() => handleDelete(s.name)}>Del</button>
            </div>
          </div>
        ))}
        {showForm && (
          <div className="settings-form" style={{ width: "auto", marginTop: 12 }}>
            <h3>New Skill</h3>
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="my-skill" />
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this skill do?" />
            <label>Instructions</label>
            <textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Instructions for the agent..." rows={5} />
            <div className="settings-form-actions">
              <button className="btn-sm btn-primary" onClick={handleCreate} disabled={creating || !form.name || !form.instructions}>{creating ? "Creating..." : "Create"}</button>
            </div>
          </div>
        )}
      </div>

      <div className="settings-form">
        <h3>Install from URL</h3>
        <label>SKILL.md URL (GitHub / SkillHub)</label>
        <input type="text" placeholder="https://raw.githubusercontent.com/..." value={installUrl} onChange={(e) => setInstallUrl(e.target.value)} />
        <div className="settings-form-actions">
          <button className="btn-sm btn-primary" onClick={handleInstallUrl} disabled={installing || !installUrl.trim()}>{installing ? "Installing..." : "Install"}</button>
        </div>
        {installMsg && <div className={`test-result ${installMsg.startsWith("✅") ? "success" : "error"}`}>{installMsg}</div>}
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />
        {selected ? (
          <>
            <h3>{selected.name}</h3>
            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>{selected.description}</p>
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", background: "var(--bg)", padding: 8, borderRadius: 6, maxHeight: 300, overflowY: "auto" }}>{selected.instructions}</pre>
          </>
        ) : <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Click a skill to see details.</p>}
      </div>
    </div>
  );
}

/* ── Memory tab ────────────────────────────────────────────────── */

const TYPE_LABELS: Record<string, string> = {
  user: "User",
  feedback: "Feedback",
  project: "Project",
  reference: "Reference",
};

const TYPE_ICONS: Record<string, string> = {
  user: "👤",
  feedback: "💡",
  project: "📋",
  reference: "🔗",
};

function MemoryTab() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState<string>("user");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMemories(filter || undefined);
      setMemories(data);
    } catch (e) {
      console.error("Failed to load memories", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const handleDelete = async (id: string) => {
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error("Failed to delete memory", e);
    }
  };

  const handleSave = async () => {
    if (!newContent.trim()) return;
    try {
      await saveMemory({ type: newType, content: newContent.trim(), tags: newTags });
      setNewContent(""); setNewTags(""); setShowForm(false);
      load();
    } catch (e) {
      console.error("Failed to save memory", e);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const counts: Record<string, number> = {};
  for (const m of memories) counts[m.type] = (counts[m.type] || 0) + 1;

  return (
    <div className="settings-body" style={{ flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)" }}>
          All Memories ({memories.length})
        </h3>
        <button className="btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Add"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {["", "user", "feedback", "project", "reference"].map((t) => (
          <button key={t}
            className={`btn-xs ${filter === t ? "active-tab" : ""}`}
            onClick={() => setFilter(t)}
            style={filter === t ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" } : undefined}
          >
            {t ? `${TYPE_ICONS[t] || ""} ${TYPE_LABELS[t] || t}` : "All"}
            {t && counts[t] ? ` (${counts[t]})` : ""}
          </button>
        ))}
      </div>

      {showForm && (
        <div style={{ marginBottom: 12, padding: 12, background: "var(--surface-hover)", borderRadius: 6, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
          <select value={newType} onChange={(e) => setNewType(e.target.value)}
            style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="user">User</option>
            <option value="feedback">Feedback</option>
            <option value="project">Project</option>
            <option value="reference">Reference</option>
          </select>
          <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)}
            placeholder="What did you learn?" rows={3}
            style={{ fontSize: 12, padding: "6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", resize: "vertical" }} />
          <input value={newTags} onChange={(e) => setNewTags(e.target.value)}
            placeholder="tags (comma-separated)"
            style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn-xs btn-primary" onClick={handleSave}>Save</button>
            <button className="btn-xs" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="memory-list" style={{ maxHeight: "none" }}>
        {loading && <p style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>Loading...</p>}
        {!loading && memories.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
            No memories yet. The agent will save observations during conversation.
          </p>
        )}
        {memories.map((m) => (
          <div key={m.id} className="memory-entry">
            <div className="memory-header">
              <span className="memory-type" title={TYPE_LABELS[m.type]}>{TYPE_ICONS[m.type] || "📌"}</span>
              <span className="memory-date">{formatTime(m.created_at)}</span>
              <span className="memory-priority">{"★".repeat(m.priority).padEnd(5, "☆")}</span>
              <button className="memory-delete" onClick={() => handleDelete(m.id)} title="Delete">✕</button>
            </div>
            <div className="memory-content">{m.content}</div>
            {m.tags && m.tags.length > 0 && (
              <div className="memory-tags">
                {m.tags.map((t) => <span key={t} className="memory-tag">{t}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Whitelist tab ──────────────────────────────────────────────── */

function WhitelistTab() {
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setWhitelist(await fetchWhitelist());
    } catch (e) {
      console.error("Failed to load whitelist", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRemove = async (toolName: string) => {
    try {
      await removeFromWhitelist(toolName);
      setWhitelist((prev) => prev.filter((n) => n !== toolName));
    } catch (e) {
      console.error("Failed to remove from whitelist", e);
    }
  };

  return (
    <div className="settings-body" style={{ flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)" }}>
          Whitelisted Tools ({whitelist.length})
        </h3>
      </div>

      {loading && <p style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>Loading...</p>}

      {!loading && whitelist.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
          No tools whitelisted yet. When a tool requires approval, use <strong>Approve &amp; Whitelist</strong> to skip future approval prompts for that tool.
        </p>
      )}

      {whitelist.map((name) => (
        <div key={name} className="config-card">
          <div className="config-card-info">
            <strong>{name}</strong>
            <span className="config-card-meta">Whitelisted ✓</span>
          </div>
          <div className="config-card-actions">
            <button className="btn-xs btn-danger" onClick={() => handleRemove(name)}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Traces tab ────────────────────────────────────────────────── */
/* TracesTab is imported from ./TracesTab */
