import type { MLCEngine } from '@mlc-ai/web-llm';
import type { CorrectionGuidance, GatePreference } from './circuitCorrector';
import { buildNlContextSections } from './nlContextPrompt';
import type { ModelCorrectionIntent, NlCorrectionContext } from './nlIntentTypes';

const ALLOWED_GATES = new Set<GatePreference>(['CNOT', 'CCNOT', 'X', 'H', 'NOT', 'AND', 'OR', 'XOR']);

export type WebLlmCorrectionIntent = ModelCorrectionIntent;

let enginePromise: Promise<MLCEngine> | null = null;

const MODEL_ID = import.meta.env.VITE_WEBLLM_MODEL ?? 'Llama-3.1-8B-Instruct';

export async function parseNaturalLanguageWithWebLlm(
  message: string,
  context: NlCorrectionContext,
  onProgress?: (text: string) => void,
): Promise<WebLlmCorrectionIntent | null> {
  if (!hasWebGpu()) return null;

  try {
    const engine = await getEngine(onProgress);
    const response = await engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(context),
        },
        {
          role: 'user',
          content: message,
        },
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

export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

async function getEngine(onProgress?: (text: string) => void): Promise<MLCEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
      return CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (progress) => {
          onProgress?.(progress.text ?? 'Loading browser language model...');
        },
      });
    })().catch((error) => {
      enginePromise = null;
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
  "guidance": {
    "preferredGates": ["CNOT", "CCNOT", "X", "H", "NOT", "AND", "OR", "XOR"],
    "gates": [
      {
        "gate": "CNOT" | "CCNOT" | "X" | "H" | "NOT" | "AND" | "OR" | "XOR",
        "inputs": string[],
        "output": string
      }
    ]
  }
}

${buildNlContextSections(context)}

Rules:
- Gate insertion requests populate guidance.gates.
- Gate preference requests populate guidance.preferredGates.
- Test, check, verify, or validate requests set runTest=true.
- Automatic repair requests set autonomous=true and runTest=true.
- Full-adder truth-table requests set loadFullAdderTable=true.
- Requests to open a cataloged process set loadCatalogProcess to that process name.
- Truth-table inference requests set inferTable=true.
- Output probing requests set probeOutputs=true.
- Unknown requests return a helpful reply and no action flags.
`.trim();
}

export function sanitizeIntent(raw: unknown): WebLlmCorrectionIntent | null {
  if (!raw || typeof raw !== 'object') return null;

  const value = raw as Record<string, unknown>;
  const guidance = sanitizeGuidance(value.guidance);

  return {
    reply: typeof value.reply === 'string'
      ? value.reply
      : 'The request was interpreted by the browser language model.',
    loadFullAdderTable: value.loadFullAdderTable === true,
    loadCatalogProcess: typeof value.loadCatalogProcess === 'string' && value.loadCatalogProcess.trim()
      ? value.loadCatalogProcess.trim()
      : undefined,
    inferTable: value.inferTable === true,
    probeOutputs: value.probeOutputs === true,
    runTest: value.runTest === true,
    autonomous: value.autonomous === true,
    guidance,
  };
}

function sanitizeGuidance(raw: unknown): CorrectionGuidance | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const value = raw as Record<string, unknown>;
  const preferredGates = Array.isArray(value.preferredGates)
    ? value.preferredGates.filter(isAllowedGate)
    : undefined;

  const gates = Array.isArray(value.gates)
    ? value.gates
      .map((gate) => {
        if (!gate || typeof gate !== 'object') return null;
        const spec = gate as Record<string, unknown>;
        if (!isAllowedGate(spec.gate)) return null;
        if (!Array.isArray(spec.inputs)) return null;
        if (typeof spec.output !== 'string') return null;
        const output = spec.output.trim();
        if (!output) return null;
        const inputs = spec.inputs
          .filter((input): input is string => typeof input === 'string')
          .map((input) => input.trim())
          .filter((input) => input.length > 0);
        if (inputs.length === 0) return null;
        return {
          gate: spec.gate,
          inputs,
          output,
        };
      })
      .filter((gate): gate is NonNullable<typeof gate> => gate !== null)
    : undefined;

  if (!preferredGates?.length && !gates?.length) return undefined;

  return {
    preferredGates: preferredGates?.length ? preferredGates : undefined,
    gates: gates?.length ? gates : undefined,
  };
}

function isAllowedGate(value: unknown): value is GatePreference {
  return typeof value === 'string' && ALLOWED_GATES.has(value as GatePreference);
}

/** @internal Test helper to reset the cached engine between tests. */
export function resetWebLlmEngineForTests() {
  enginePromise = null;
}
