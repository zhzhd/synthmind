import { useEffect, useState } from "react";
import type { ModelConfig, ModelInfo } from "../lib/api";
import { fetchModels } from "../lib/api";

interface Props {
  config: ModelConfig;
  onChange: (config: ModelConfig) => void;
}

export default function ModelSelector({ config, onChange }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    fetchModels()
      .then(setModels)
      .catch(() => {
        // Backend might not be running yet; show defaults
      });
  }, []);

  const providers = [...new Set(models.map((m) => m.provider))];

  const availableModels = models.filter(
    (m) => m.provider === config.provider && m.available,
  );

  return (
    <div className="model-selector">
      <div className="sidebar-section">
        <h3>Model</h3>

        <div className="model-selector" style={{ marginBottom: 8 }}>
          <label>Provider</label>
          <select
            value={config.provider}
            onChange={(e) => {
              const newProvider = e.target.value;
              const firstModel = models.find((m) => m.provider === newProvider && m.available)?.model;
              onChange({ ...config, provider: newProvider, model: firstModel || config.model });
            }}
          >
            {providers.length > 0
              ? providers.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))
              : (
                <>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="ollama">Ollama (local)</option>
                </>
              )}
          </select>
        </div>

        <div className="model-selector">
          <label>Model</label>
          <select
            value={config.model}
            onChange={(e) =>
              onChange({ ...config, model: e.target.value })
            }
          >
            {availableModels.length > 0
              ? availableModels.map((m) => (
                  <option key={m.model} value={m.model}>
                    {m.model}
                  </option>
                ))
              : config.model
              ? (
                <option value={config.model}>{config.model}</option>
              )
              : (
                <option value="">(models loading...)</option>
              )}
          </select>
        </div>
      </div>
    </div>
  );
}
