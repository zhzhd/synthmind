import { useEffect, useState } from "react";
import type { ProviderConfig, SkillInfo, SkillDetail } from "../lib/api";
import {
  fetchConfigs, createConfig, updateConfig, deleteConfig, testConfig,
  fetchSkills, fetchSkillDetail, createSkill, deleteSkill, toggleSkill, installSkillFromUrl,
} from "../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PROVIDER_TYPES = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama (local)" },
];

const EMPTY_PROVIDER_FORM = { name: "", provider: "openai" as const, model: "", api_key: "", base_url: "" };
type ProviderForm = typeof EMPTY_PROVIDER_FORM;

export default function SettingsPanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<"providers" | "skills">("providers");
  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal skill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div style={{ display: "flex", gap: 4 }}>
            <button className={`tab-btn ${tab === "providers" ? "active" : ""}`} onClick={() => setTab("providers")}>Providers</button>
            <button className={`tab-btn ${tab === "skills" ? "active" : ""}`} onClick={() => setTab("skills")}>Skills</button>
          </div>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        {tab === "providers" ? <ProviderTab /> : <SkillsTab />}
      </div>
    </div>
  );
}

/* ── Provider tab ──────────────────────────────────────────────── */

function ProviderTab() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
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
          <button className="btn-sm" onClick={() => { setEditing(null); setForm(EMPTY_PROVIDER_FORM); setTestResult(null); }}>+ Add</button>
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
        </div>
      </div>
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
