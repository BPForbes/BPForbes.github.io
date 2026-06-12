import type { GatePreference } from '../circuitCorrector';
import { defaultLlmSettings } from './config';
import { buildNlContextSections } from './contextPrompt';
import type { ModelCorrectionIntent, NlCorrectionContext } from './intentTypes';

export type LlmEndpointConfig = { url: string; model: string };

const ALLOWED_GATES = new Set<GatePreference>(['CNOT', 'CCNOT', 'X', 'H', 'NOT', 'AND', 'OR', 'XOR']);
const OLLAMA_TIMEOUT_MS = 8_000;

function toStrictBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

const buildPrompt = (message: string, context: NlCorrectionContext): string => `
You are a strict JSON intent parser for a QPU circuit correction tool.
Return JSON only.

Allowed JSON shape:
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
    "preferredGates": string[],
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
- Follow AGENTS.md. Never propose edits to protected bundled truth tables.

Examples:
- "load the full adder truth table" -> { "reply": "...", "loadFullAdderTable": true }
- "add a CNOT from A to Sum" -> { "reply": "...", "runTest": true, "guidance": { "gates": [{ "gate": "CNOT", "inputs": ["A"], "output": "Sum" }] } }
- "fix the circuit automatically" -> { "reply": "...", "runTest": true, "autonomous": true }
- "update qpuio" -> { "reply": "...", "updateQpuio": true }
- "update qpucir" -> { "reply": "...", "updateQpucir": true }
- "update both qpucir and qpuio" -> { "reply": "...", "updateQpuio": true, "updateQpucir": true }

User message:
${message}
`.trim();

// Model output is untrusted JSON; only the explicit correction-action schema is allowed through.
export const sanitizeIntent = (raw: unknown): ModelCorrectionIntent | null => {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const guidanceRaw = record.guidance;
  let guidance: ModelCorrectionIntent['guidance'];

  if (guidanceRaw && typeof guidanceRaw === 'object') {
    const guidanceRecord = guidanceRaw as Record<string, unknown>;
    const preferredGates = Array.isArray(guidanceRecord.preferredGates)
      ? guidanceRecord.preferredGates
        .filter((gate): gate is GatePreference => typeof gate === 'string' && ALLOWED_GATES.has(gate as GatePreference))
      : undefined;

    const gates = Array.isArray(guidanceRecord.gates)
      ? guidanceRecord.gates.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const gateEntry = entry as Record<string, unknown>;
        const gate = typeof gateEntry.gate === 'string' && ALLOWED_GATES.has(gateEntry.gate as GatePreference)
          ? gateEntry.gate as GatePreference
          : null;
        const inputs = Array.isArray(gateEntry.inputs)
          ? gateEntry.inputs.filter((input): input is string => typeof input === 'string')
          : [];
        const output = typeof gateEntry.output === 'string' ? gateEntry.output : '';
        if (!gate || inputs.length === 0 || !output) return [];
        return [{ gate, inputs, output }];
      })
      : undefined;

    if ((preferredGates?.length ?? 0) > 0 || (gates?.length ?? 0) > 0) {
      guidance = {
        preferredGates: preferredGates?.length ? preferredGates : undefined,
        gates: gates?.length ? gates : undefined,
      };
    }
  }

  const intent: ModelCorrectionIntent = {
    reply: typeof record.reply === 'string'
      ? record.reply
      : 'Parsed request with the local language model.',
    loadFullAdderTable: toStrictBoolean(record.loadFullAdderTable),
    inferTable: toStrictBoolean(record.inferTable),
    probeOutputs: toStrictBoolean(record.probeOutputs),
    runTest: toStrictBoolean(record.runTest),
    autonomous: toStrictBoolean(record.autonomous),
    guidance,
  };

  if (typeof record.loadCatalogProcess === 'string' && record.loadCatalogProcess.trim()) {
    intent.loadCatalogProcess = record.loadCatalogProcess.trim();
  }
  if (toStrictBoolean(record.updateQpuio)) {
    intent.updateQpuio = true;
  }
  if (toStrictBoolean(record.updateQpucir)) {
    intent.updateQpucir = true;
  }

  return intent;
};

// Remote model calls use the same prompt/context path as browser models but timeout quickly to preserve the deterministic fallback.
export const parseNaturalLanguageWithModel = async (
  message: string,
  context: NlCorrectionContext,
  endpoint: LlmEndpointConfig = {
    url: defaultLlmSettings().ollamaUrl,
    model: defaultLlmSettings().ollamaModel,
  },
): Promise<ModelCorrectionIntent | null> => {
  try {
    const prompt = buildPrompt(message, context);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: endpoint.model,
          prompt,
          stream: false,
          format: 'json',
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) return null;

    const data = await response.json() as { response?: string };
    if (!data.response) return null;

    const raw = JSON.parse(data.response) as unknown;
    return sanitizeIntent(raw);
  } catch {
    return null;
  }
};
