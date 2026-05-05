import { useEffect, useState } from "react";
import type { SkillInfo, SkillDetail } from "../lib/api";
import {
  fetchSkills,
  fetchSkillDetail,
  createSkill,
  deleteSkill,
  toggleSkill,
  installSkillFromUrl,
} from "../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SkillManager({ open, onClose }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selected, setSelected] = useState<SkillDetail | null>(null);
  const [installUrl, setInstallUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState("");

  // Create-skill form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", instructions: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) load();
  }, [open]);

  const load = async () => {
    try {
      const list = await fetchSkills();
      setSkills(list);
    } catch { /* backend might not be running */ }
  };

  const handleSelect = async (name: string) => {
    try {
      const detail = await fetchSkillDetail(name);
      setSelected(detail);
    } catch { /* ignore */ }
  };

  const handleToggle = async (name: string, active: boolean) => {
    try {
      await toggleSkill(name, active);
      await load();
    } catch (e) {
      alert(`Toggle failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete skill "${name}"?`)) return;
    try {
      await deleteSkill(name);
      if (selected?.name === name) setSelected(null);
      await load();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleInstallUrl = async () => {
    if (!installUrl.trim()) return;
    setInstalling(true);
    setInstallMsg("");
    try {
      const result = await installSkillFromUrl(installUrl.trim());
      setInstallMsg(`✅ Installed: ${result.name}`);
      setInstallUrl("");
      await load();
    } catch (e) {
      setInstallMsg(`❌ ${e instanceof Error ? e.message : e}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name || !form.instructions) return;
    setCreating(true);
    try {
      await createSkill(form);
      setShowForm(false);
      setForm({ name: "", description: "", instructions: "" });
      await load();
    } catch (e) {
      alert(`Create failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal skill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Skills</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          {/* Left: skill list */}
          <div className="settings-list">
            <div className="settings-list-header">
              <h3>Installed Skills</h3>
              <button className="btn-sm" onClick={() => setShowForm(!showForm)}>
                {showForm ? "Cancel" : "+ New"}
              </button>
            </div>

            {skills.length === 0 && (
              <p className="settings-empty">No skills installed.</p>
            )}

            {skills.map((s) => (
              <div key={s.name} className="config-card">
                <div className="config-card-info" onClick={() => handleSelect(s.name)} style={{ cursor: "pointer" }}>
                  <strong>{s.name}</strong>
                  <span className="config-card-meta">{s.description || s.author}</span>
                </div>
                <div className="config-card-actions">
                  <button className="btn-xs" onClick={() => handleToggle(s.name, !s.active)}>
                    {s.active ? "ON" : "OFF"}
                  </button>
                  <button className="btn-xs btn-danger" onClick={() => handleDelete(s.name)}>
                    Del
                  </button>
                </div>
              </div>
            ))}

            {/* Create form inline */}
            {showForm && (
              <div className="settings-form" style={{ width: "auto", marginTop: 12 }}>
                <h3>New Skill</h3>
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="my-skill" />
                <label>Description</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this skill do?" />
                <label>Instructions (Markdown)</label>
                <textarea
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  placeholder="Instructions for the agent..."
                  rows={5}
                  style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font)", fontSize: 13, resize: "vertical" }}
                />
                <div className="settings-form-actions">
                  <button className="btn-sm btn-primary" onClick={handleCreate} disabled={creating || !form.name || !form.instructions}>
                    {creating ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: always show install URL on top, detail below */}
          <div className="settings-form">
            <h3>Install from URL</h3>
            <label>SKILL.md URL (GitHub / SkillHub)</label>
            <input
              type="text"
              placeholder="https://raw.githubusercontent.com/..."
              value={installUrl}
              onChange={(e) => setInstallUrl(e.target.value)}
            />
            <div className="settings-form-actions">
              <button className="btn-sm btn-primary" onClick={handleInstallUrl} disabled={installing || !installUrl.trim()}>
                {installing ? "Installing..." : "Install"}
              </button>
            </div>
            {installMsg && (
              <div className={`test-result ${installMsg.startsWith("✅") ? "success" : "error"}`}>
                {installMsg}
              </div>
            )}

            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />

            {selected ? (
              <>
                <h3>{selected.name}</h3>
                <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>{selected.description}</p>
                <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>v{selected.version} by {selected.author}</p>
                <pre style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", background: "var(--bg)", padding: 8, borderRadius: 6, maxHeight: 300, overflowY: "auto" }}>
                  {selected.instructions}
                </pre>
              </>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Click a skill in the list to see details.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
