import { useEffect, useState } from "react";
import type { ProviderConfig } from "../lib/api";
import {
  fetchConfigs,
  createConfig,
  updateConfig,
  deleteConfig,
  testConfig,
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

const EMPTY_FORM = {
  name: "",
  provider: "openai" as const,
  model: "",
  api_key: "",
  base_url: "",
};

type FormData = typeof EMPTY_FORM;

export default function SettingsPanel({ open, onClose }: Props) {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // null = adding new
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) loadConfigs();
  }, [open]);

  const loadConfigs = async () => {
    try {
      const data = await fetchConfigs();
      setConfigs(data);
    } catch {
      // backend may not be running
    }
  };

  const handleEdit = (cfg: ProviderConfig) => {
    setEditing(cfg.id);
    setForm({
      name: cfg.name,
      provider: cfg.provider,
      model: cfg.model,
      api_key: cfg.api_key,
      base_url: cfg.base_url,
    });
    setTestResult(null);
  };

  const handleAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!form.name || !form.model) return;
    setSaving(true);
    try {
      if (editing) {
        await updateConfig(editing, form);
      } else {
        await createConfig(form);
      }
      await loadConfigs();
      setEditing("_saved");
      setForm(EMPTY_FORM);
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this configuration?")) return;
    try {
      await deleteConfig(id);
      await loadConfigs();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleTest = async () => {
    if (!form.model) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConfig(form);
      setTestResult(result.ok ? `✅ ${result.response}` : `❌ ${result.error}`);
    } catch (e) {
      setTestResult(`❌ ${e instanceof Error ? e.message : e}`);
    } finally {
      setTesting(false);
    }
  };

  if (!open) return null;

  const isFormActive = editing !== "_saved" && editing !== undefined;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Provider Settings</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          {/* ── Config list ── */}
          <div className="settings-list">
            <div className="settings-list-header">
              <h3>Configured Models</h3>
              <button className="btn-sm" onClick={handleAdd}>+ Add</button>
            </div>
            {configs.length === 0 && (
              <p className="settings-empty">No configurations yet. Click "+ Add" to create one.</p>
            )}
            {configs.map((cfg) => (
              <div key={cfg.id} className="config-card">
                <div className="config-card-info">
                  <strong>{cfg.name}</strong>
                  <span className="config-card-meta">
                    {cfg.provider} / {cfg.model}
                  </span>
                </div>
                <div className="config-card-actions">
                  <button className="btn-xs" onClick={() => handleEdit(cfg)}>Edit</button>
                  <button className="btn-xs btn-danger" onClick={() => handleDelete(cfg.id)}>Del</button>
                </div>
              </div>
            ))}
          </div>

          {/* ── Edit / Add form ── */}
          <div className="settings-form">
            <h3>{editing ? "Edit Model" : "Add Model"}</h3>

            <label>Display Name</label>
            <input
              type="text"
              placeholder="e.g. My Claude"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <label>Provider</label>
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
            >
              {PROVIDER_TYPES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            <label>Model</label>
            <input
              type="text"
              placeholder="e.g. claude-sonnet-4-20250514"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />

            <label>API Key</label>
            <input
              type="password"
              placeholder="sk-..."
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            />

            <label>Base URL <span className="label-hint">(optional)</span></label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            />

            {testResult && (
              <div className={`test-result ${testResult.startsWith("✅") ? "success" : "error"}`}>
                {testResult}
              </div>
            )}

            <div className="settings-form-actions">
              <button className="btn-sm" onClick={handleTest} disabled={testing || !form.model}>
                {testing ? "Testing..." : "Test"}
              </button>
              <button
                className="btn-sm btn-primary"
                onClick={handleSave}
                disabled={saving || !form.name || !form.model}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
