export type LlmEndpointConfig = {
  url: string;
  model: string;
};

const STORAGE_KEY = 'qpu-llm-endpoint-v1';

const DEFAULT_URL = import.meta.env.VITE_OLLAMA_URL ?? 'http://localhost:11434/api/generate';
const DEFAULT_MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? 'llama3.2:1b';

export const defaultLlmConfig = (): LlmEndpointConfig => ({
  url: DEFAULT_URL,
  model: DEFAULT_MODEL,
});

export const loadLlmConfig = (): LlmEndpointConfig => {
  if (typeof localStorage === 'undefined') return defaultLlmConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLlmConfig();
    const parsed = JSON.parse(raw) as Partial<LlmEndpointConfig>;
    return {
      url: typeof parsed.url === 'string' && parsed.url.trim() ? parsed.url.trim() : DEFAULT_URL,
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MODEL,
    };
  } catch {
    return defaultLlmConfig();
  }
};

export const saveLlmConfig = (config: LlmEndpointConfig) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    url: config.url.trim() || DEFAULT_URL,
    model: config.model.trim() || DEFAULT_MODEL,
  }));
};
