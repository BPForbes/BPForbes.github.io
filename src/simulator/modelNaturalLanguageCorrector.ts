import type { GatePreference } from './circuitCorrector';
import type { ModelCorrectionIntent, NlCorrectionContext } from './nlIntentTypes';

const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL ?? 'http://localhost:11434/api/generate';
const MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? 'llama3.2';

const ALLOWED_GATES = new Set<GatePreference>(['CNOT', 'CCNOT', 'X', 'H', 'NOT', 'AND', 'OR', 'XOR']);

const buildPrompt = (message: string, context: NlCorrectionContext): string => `
You are a strict JSON intent parser for a QPU circuit correction tool.
Return JSON only.

Allowed JSON shape:
{
  "reply": string,
  "loadFullAdderTable": boolean,
  "inferTable": boolean,
  "probeOutputs": boolean,
  "runTest": boolean,
  "autonomous": boolean,
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

Available input columns: ${context.inputColumns.join(', ') || '(none)'}
Available output columns: ${context.outputColumns.join(', ') || '(none)'}

Examples:
- "load the full adder truth table" -> { "reply": "...", "loadFullAdderTable": true }
- "add a CNOT from A to Sum" -> { "reply": "...", "runTest": true, "guidance": { "gates": [{ "gate": "CNOT", "inputs": ["A"], "output": "Sum" }] } }
- "fix the circuit automatically" -> { "reply": "...", "runTest": true, "autonomous": true }

User message:
${message}
`.trim();

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

  return {
    reply: typeof record.reply === 'string'
      ? record.reply
      : 'Parsed request with the local language model.',
    loadFullAdderTable: Boolean(record.loadFullAdderTable),
    inferTable: Boolean(record.inferTable),
    probeOutputs: Boolean(record.probeOutputs),
    runTest: Boolean(record.runTest),
    autonomous: Boolean(record.autonomous),
    guidance,
  };
};

export const parseNaturalLanguageWithModel = async (
  message: string,
  context: NlCorrectionContext,
): Promise<ModelCorrectionIntent | null> => {
  try {
    const prompt = buildPrompt(message, context);
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        format: 'json',
      }),
    });

    if (!response.ok) return null;

    const data = await response.json() as { response?: string };
    if (!data.response) return null;

    const raw = JSON.parse(data.response) as unknown;
    return sanitizeIntent(raw);
  } catch {
    return null;
  }
};
