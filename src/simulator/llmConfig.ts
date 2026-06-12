/**
 * Browser-model configuration and cache markers for correction assistance.
 *
 * The selected WebLLM model is centralized here so preload, readiness checks,
 * and cache-clearing workflows agree on the same default browser runtime.
 */
export type LlmMode = 'browser' | 'ollama';

export type LlmSettings = {
  mode: LlmMode;
  browserModel: string;
  ollamaUrl: string;
  ollamaModel: string;
};

const STORAGE_KEY = 'qpu-llm-settings-v2';

export const DEFAULT_BROWSER_MODEL = import.meta.env.VITE_WEBLLM_MODEL ?? 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const DEFAULT_OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL ?? 'http://localhost:11434/api/generate';
const DEFAULT_OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? 'llama3.2:1b';

export const BROWSER_MODEL_OPTIONS = [
  'SmolLM2-360M-Instruct-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
] as const;

export const defaultLlmSettings = (): LlmSettings => ({
  mode: 'browser',
  browserModel: DEFAULT_BROWSER_MODEL,
  ollamaUrl: DEFAULT_OLLAMA_URL,
  ollamaModel: DEFAULT_OLLAMA_MODEL,
});

const migrateLegacyConfig = (): LlmSettings | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const legacy = localStorage.getItem('qpu-llm-endpoint-v1');
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as { url?: string; model?: string };
    return {
      mode: 'ollama',
      browserModel: DEFAULT_BROWSER_MODEL,
      ollamaUrl: parsed.url?.trim() || DEFAULT_OLLAMA_URL,
      ollamaModel: parsed.model?.trim() || DEFAULT_OLLAMA_MODEL,
    };
  } catch {
    return null;
  }
};

export const loadLlmSettings = (): LlmSettings => {
  if (typeof localStorage === 'undefined') return defaultLlmSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateLegacyConfig() ?? defaultLlmSettings();
    const parsed = JSON.parse(raw) as Partial<LlmSettings>;
    return {
      mode: parsed.mode === 'ollama' ? 'ollama' : 'browser',
      browserModel: typeof parsed.browserModel === 'string' && parsed.browserModel.trim()
        ? parsed.browserModel.trim()
        : DEFAULT_BROWSER_MODEL,
      ollamaUrl: typeof parsed.ollamaUrl === 'string' && parsed.ollamaUrl.trim()
        ? parsed.ollamaUrl.trim()
        : DEFAULT_OLLAMA_URL,
      ollamaModel: typeof parsed.ollamaModel === 'string' && parsed.ollamaModel.trim()
        ? parsed.ollamaModel.trim()
        : DEFAULT_OLLAMA_MODEL,
    };
  } catch {
    return defaultLlmSettings();
  }
};

const BROWSER_CACHE_KEY = 'qpu-browser-model-cached';

export const getCachedBrowserModelId = (): string | null => {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(BROWSER_CACHE_KEY);
};

export const markBrowserModelCached = (modelId: string) => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(BROWSER_CACHE_KEY, modelId);
};

export const clearBrowserModelCache = () => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(BROWSER_CACHE_KEY);
};

export const saveLlmSettings = (settings: LlmSettings) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    mode: settings.mode,
    browserModel: settings.browserModel.trim() || DEFAULT_BROWSER_MODEL,
    ollamaUrl: settings.ollamaUrl.trim() || DEFAULT_OLLAMA_URL,
    ollamaModel: settings.ollamaModel.trim() || DEFAULT_OLLAMA_MODEL,
  }));
};

/** @deprecated Use LlmSettings */
export type LlmEndpointConfig = { url: string; model: string };
