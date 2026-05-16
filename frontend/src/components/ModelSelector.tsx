import { useEffect, useState } from "react";
import type { ModelConfig, ModelInfo } from "../lib/api";
import { fetchModels } from "../lib/api";

interface Props {
  config: ModelConfig;
  onChange: (config: ModelConfig) => void;
}

const REASONING_EFFORT_OPTIONS = [
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
];

export default function ModelSelector({ config, onChange }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    fetchModels()
      .then(setModels)
      .catch(() => {});
  }, []);

  const availableModels = models.filter((m) => m.provider === "deepseek" && m.available);
  const modelList = availableModels.length > 0
    ? availableModels.map((m) => m.model)
    : ["deepseek-v4-flash", "deepseek-v4-pro"];

  return (
    <div className="model-selector">
      <div className="sidebar-section">
        <h3>DeepSeek Model</h3>

        <div className="model-selector" style={{ marginBottom: 8 }}>
          <label>Model</label>
          <select
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
          >
            {modelList.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="model-selector">
          <label>Reasoning Effort</label>
          <select
            value={config.reasoning_effort || "high"}
            onChange={(e) => onChange({ ...config, reasoning_effort: e.target.value })}
          >
            {REASONING_EFFORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
