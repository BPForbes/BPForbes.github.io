/**
 * WebLLM-backed natural-language correction adapter.
 *
 * The model engine is loaded lazily because browser model downloads are large
 * and require WebGPU; deterministic parsers remain available when this adapter
 * cannot initialize. WebLLM reference: https://github.com/mlc-ai/web-llm
 */
import type { MLCEngine } from '@mlc-ai/web-llm';
import { DEFAULT_BROWSER_MODEL, getCachedBrowserModelId, markBrowserModelCached, clearBrowserModelCache } from './llmConfig';
import { buildNlContextSections } from './nlContextPrompt';
import type { ModelCorrectionIntent, NlCorrectionContext } from './nlIntentTypes';
import { sanitizeIntent } from './modelNaturalLanguageCorrector';
import { hasWebGpu } from './webGpu';

let enginePromise: Promise<MLCEngine> | null = null;
let loadedModelId: string | null = null;

const resetBrowserModelEngine = () => {
  enginePromise = null;
  loadedModelId = null;
};

export function isBrowserModelReady(modelId: string = DEFAULT_BROWSER_MODEL): boolean {
  return (enginePromise !== null && loadedModelId === modelId) || getCachedBrowserModelId() === modelId;
}

export async function preloadBrowserModel(
  modelId: string = DEFAULT_BROWSER_MODEL,
  onProgress?: (text: string) => void,
): Promise<boolean> {
  if (!hasWebGpu()) return false;
  await getEngine(modelId, onProgress);
  markBrowserModelCached(modelId);
  return true;
}

export async function clearBrowserModel(
  modelId: string = DEFAULT_BROWSER_MODEL,
  onProgress?: (text: string) => void,
): Promise<void> {
  resetBrowserModelEngine();
  clearBrowserModelCache();
  const { deleteModelInCache } = await import('@mlc-ai/web-llm');
  onProgress?.('Clearing cached model files…');
  await deleteModelInCache(modelId);
}

export async function parseNaturalLanguageWithWebLlm(
  message: string,
  context: NlCorrectionContext,
  options?: { modelId?: string; onProgress?: (text: string) => void },
): Promise<ModelCorrectionIntent | null> {
  if (!hasWebGpu()) return null;

  try {
    const modelId = options?.modelId ?? DEFAULT_BROWSER_MODEL;
    const engine = await getEngine(modelId, options?.onProgress);
    const response = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: buildSystemPrompt(context) },
        { role: 'user', content: message },
      ],
      temperature: 0,
      max_tokens: 350,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    return sanitizeIntent(JSON.parse(content));
  } catch {
    return null;
  }
}

async function getEngine(modelId: string, onProgress?: (text: string) => void): Promise<MLCEngine> {
  if (enginePromise && loadedModelId !== modelId) {
    enginePromise = null;
    loadedModelId = null;
  }

  if (!enginePromise) {
    loadedModelId = modelId;
    enginePromise = (async () => {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
      return CreateMLCEngine(modelId, {
        initProgressCallback: (progress) => {
          const pct = typeof progress.progress === 'number'
            ? ` (${Math.round(progress.progress * 100)}%)`
            : '';
          onProgress?.(`${progress.text ?? 'Loading browser model…'}${pct}`);
        },
      });
    })().catch((error) => {
      enginePromise = null;
      loadedModelId = null;
      throw error;
    });
  }

  return enginePromise;
}

function buildSystemPrompt(context: NlCorrectionContext): string {
  return `
The system converts natural-language QPU circuit correction requests into strict JSON.
Output JSON only.

Allowed schema:
{
  "reply": string,
  "loadFullAdderTable": boolean,
  "loadCatalogProcess": string,
  "inferTable": boolean,
  "probeOutputs": boolean,
  "runTest": boolean,
  "autonomous": boolean,
  "updateQpuio": boolean,
  "updateQpucir": boolean,
  "guidance": {
    "preferredGates": ["CNOT", "CCNOT", "X", "H", "NOT", "AND", "OR", "XOR"],
    "gates": [{ "gate": string, "inputs": string[], "output": string }]
  }
}

${buildNlContextSections(context)}

Rules:
- Follow AGENTS.md. Never propose edits to protected bundled truth tables.
- Test/check/verify requests set runTest=true.
- Automatic repair requests set autonomous=true and runTest=true.
- Catalog open requests set loadCatalogProcess to the process name.
- Gate insertion requests populate guidance.gates.
- "update qpuio" -> updateQpuio=true; "update qpucir" -> updateQpucir=true; both -> set both true.
`.trim();
}

/** @internal Test helper */
export function resetWebLlmEngineForTests() {
  resetBrowserModelEngine();
  clearBrowserModelCache();
}
