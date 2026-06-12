import { findCatalogCandidates } from '../../data/catalog/processCatalog';
import { formatAddressLabel, resolveWireAddress, resolveWireAddressOr } from '../correction/addressResolution';
import { buildClarificationIntent } from '../correction/clarification';
import type { GatePreference, GuidedGateSpec } from '../correction/circuitCorrector';
import type { ModelCorrectionIntent, NlCorrectionContext } from './intentTypes';
import { isTruthCellValue, type TruthCellValue, type TruthTable } from '../compiler/truthTable';

export type { ModelCorrectionIntent, NlCorrectionContext, NlCorrectionIntent } from './intentTypes';

// Aliases collapse prose and protocol spellings into the small gate vocabulary the corrector can synthesize safely.
const GATE_ALIASES: Record<string, GatePreference> = {
  cnot: 'CNOT',
  controllednot: 'CNOT',
  'controlled-not': 'CNOT',
  'controlled not': 'CNOT',
  ccnot: 'CCNOT',
  toffoli: 'CCNOT',
  x: 'X',
  paulix: 'X',
  not: 'NOT',
  h: 'H',
  hadamard: 'H',
  and: 'AND',
  or: 'OR',
  xor: 'XOR',
};

const GATE_NAMES = Object.keys(GATE_ALIASES).join('|');
const gatePattern = new RegExp(`\\b(${GATE_NAMES})\\b`, 'gi');
const WIRE_TOKEN = String.raw`[$\w]+(?::\d+)?|\d+:\d+`;

const toTruthCellValue = (raw: string): TruthCellValue | null => {
  const normalized = raw.endsWith('p') ? raw : `${raw}p`;
  return isTruthCellValue(normalized) ? normalized : null;
};

// Address lookup uses the full resolver so register names, wire tokens, and $-prefixed refs all match.
const findRegister = (name: string, context: NlCorrectionContext) => resolveWireAddressOr(name, context);

// Space-collapsed and space-free spellings both match so "controlled not" and "controllednot" resolve identically.
const parseGateName = (raw: string): GatePreference | undefined => (
  GATE_ALIASES[raw.toLowerCase().replace(/\s+/g, ' ').trim()]
  ?? GATE_ALIASES[raw.toLowerCase().replace(/\s+/g, '')]
);

// Connective words like "and", "with", and "from" are stripped so "A and B" tokenizes to ["A", "B"].
const parseTokenList = (raw: string, context: NlCorrectionContext) => (
  raw
    .replace(/\s+and\s+/gi, ' ')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !/^(with|from|inputs?|controls?)$/i.test(token))
    .map((token) => findRegister(token, context))
);

// Silent no-ops on incomplete specs let partial pattern matches accumulate without throwing.
const pushGateSpec = (
  specs: GuidedGateSpec[],
  gate: GatePreference | undefined,
  inputs: string[],
  output: string | undefined,
) => {
  if (!gate || inputs.length === 0 || !output) return;
  specs.push({ gate, inputs, output });
};

// Gate extraction accepts both protocol-style flags and prose so common fixes avoid model latency entirely.
const extractGateSpecs = (message: string, context: NlCorrectionContext): GuidedGateSpec[] => {
  const specs: GuidedGateSpec[] = [];
  const normalized = message.replace(/\s+/g, ' ').trim();

  const astPattern = new RegExp(
    `\\b(${GATE_NAMES})\\s+-I\\s+((?:${WIRE_TOKEN})(?:\\s+(?:${WIRE_TOKEN}))*)\\s+-O\\s+(${WIRE_TOKEN})`,
    'gi',
  );
  let astMatch = astPattern.exec(normalized);
  while (astMatch) {
    pushGateSpec(
      specs,
      parseGateName(astMatch[1]),
      parseTokenList(astMatch[2], context),
      findRegister(astMatch[3], context),
    );
    astMatch = astPattern.exec(normalized);
  }
  if (specs.length > 0) return specs;

  const bindPattern = new RegExp(
    `\\b(?:bind|wire|connect)\\s+(${GATE_NAMES})\\s+(?:gate\\s+)?(?:inputs?\\s+)?((?:${WIRE_TOKEN})(?:\\s+(?:${WIRE_TOKEN}))*)\\s+(?:to|into|onto|->)\\s+(${WIRE_TOKEN})`,
    'gi',
  );
  let bindMatch = bindPattern.exec(normalized);
  while (bindMatch) {
    pushGateSpec(
      specs,
      parseGateName(bindMatch[1]),
      parseTokenList(bindMatch[2], context),
      findRegister(bindMatch[3], context),
    );
    bindMatch = bindPattern.exec(normalized);
  }
  if (specs.length > 0) return specs;

  const reverseBindPattern = new RegExp(
    `\\b(?:connect|wire|bind)\\s+((?:${WIRE_TOKEN})(?:\\s+(?:and\\s+)?(?:${WIRE_TOKEN}))*)\\s+to\\s+(${WIRE_TOKEN})\\s+(?:with|using|via)\\s+(${GATE_NAMES})\\b`,
    'gi',
  );
  let reverseMatch = reverseBindPattern.exec(normalized);
  while (reverseMatch) {
    pushGateSpec(
      specs,
      parseGateName(reverseMatch[3]),
      parseTokenList(reverseMatch[1], context),
      findRegister(reverseMatch[2], context),
    );
    reverseMatch = reverseBindPattern.exec(normalized);
  }
  if (specs.length > 0) return specs;

  const gateOnPattern = new RegExp(
    `\\b(${GATE_NAMES})\\s+(?:gate\\s+)?on\\s+((?:${WIRE_TOKEN})(?:\\s+(?:and\\s+)?(?:${WIRE_TOKEN}))*)\\s+(?:to|into|onto|targeting|->)\\s+(${WIRE_TOKEN})`,
    'gi',
  );
  let onMatch = gateOnPattern.exec(normalized);
  while (onMatch) {
    pushGateSpec(
      specs,
      parseGateName(onMatch[1]),
      parseTokenList(onMatch[2], context),
      findRegister(onMatch[3], context),
    );
    onMatch = gateOnPattern.exec(normalized);
  }
  if (specs.length > 0) return specs;

  const gateFromToPattern = new RegExp(
    `\\b(${GATE_NAMES})\\s+from\\s+((?:${WIRE_TOKEN})(?:\\s+(?:and\\s+)?(?:${WIRE_TOKEN}))*)\\s+to\\s+(${WIRE_TOKEN})`,
    'gi',
  );
  let fromToMatch = gateFromToPattern.exec(normalized);
  while (fromToMatch) {
    pushGateSpec(
      specs,
      parseGateName(fromToMatch[1]),
      parseTokenList(fromToMatch[2], context),
      findRegister(fromToMatch[3], context),
    );
    fromToMatch = gateFromToPattern.exec(normalized);
  }
  if (specs.length > 0) return specs;

  const naturalPattern = new RegExp(
    `(?:add|insert|put|use|apply)\\s+(?:a\\s+)?(${GATE_NAMES})(?:\\s+gate)?(?:\\s+(?:with|from|using))?\\s+(.+?)(?:\\s+(?:to|into|onto|->|output|-O)\\s+(${WIRE_TOKEN}))?$`,
    'i',
  );
  const naturalMatch = normalized.match(naturalPattern);
  if (naturalMatch) {
    const output = naturalMatch[3]
      ? findRegister(naturalMatch[3], context)
      : context.outputColumns.length === 1
        ? context.outputColumns[0]
        : undefined;
    pushGateSpec(
      specs,
      parseGateName(naturalMatch[1]),
      parseTokenList(naturalMatch[2], context),
      output,
    );
  }

  return specs;
};

// Preferences bias later synthesis without changing the circuit immediately.
const extractPreferredGates = (message: string): GatePreference[] => {
  const preferred: GatePreference[] = [];
  const preferPattern = /prefer(?:red|ring)?\s+([\w\s,-]+?)(?:\s+gates?)?(?:\.|$)/i;
  const onlyPattern = /only\s+use\s+([\w\s,-]+?)(?:\s+gates?)?(?:\.|$)/i;
  const match = message.match(preferPattern) ?? message.match(onlyPattern);
  if (!match) return preferred;

  match[1].split(/,|\band\b/i).forEach((part) => {
    const gate = parseGateName(part.trim());
    if (gate && !preferred.includes(gate)) preferred.push(gate);
  });
  return preferred;
};

// Catalog open requests are parsed separately from correction requests so loading examples does not trigger edits.
const parseCatalogOpenTarget = (message: string) => {
  const match = message.match(
    /\b(?:load|open|use)\s+(?:the\s+)?(?<target>[\w.-]+(?:\.qpucir)?)\b/i,
  );
  return match?.groups?.target ?? null;
};

type GateBindingDraft = {
  gate: GatePreference;
  inputTokens: string[];
  outputToken?: string;
};

const extractRawWireTokens = (raw: string) => (
  raw
    .replace(/\s+and\s+/gi, ' ')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !/^(with|from|inputs?|controls?)$/i.test(token))
);

// Draft extraction keeps raw wire tokens so ambiguous addresses can be clarified before canonicalization.
const extractGateBindingDraft = (message: string): GateBindingDraft | null => {
  const normalized = message.replace(/\s+/g, ' ').trim();

  const astPattern = new RegExp(
    `\\b(${GATE_NAMES})\\s+-I\\s+((?:${WIRE_TOKEN})(?:\\s+(?:${WIRE_TOKEN}))*)\\s+-O\\s+(${WIRE_TOKEN})`,
    'i',
  );
  const astMatch = normalized.match(astPattern);
  if (astMatch) {
    const gate = parseGateName(astMatch[1]);
    if (!gate) return null;
    return {
      gate,
      inputTokens: extractRawWireTokens(astMatch[2]),
      outputToken: astMatch[3],
    };
  }

  const bindPattern = new RegExp(
    `\\b(?:bind|wire|connect)\\s+(${GATE_NAMES})\\s+(?:gate\\s+)?(?:inputs?\\s+)?((?:${WIRE_TOKEN})(?:\\s+(?:${WIRE_TOKEN}))*)\\s+(?:to|into|onto|->)\\s+(${WIRE_TOKEN})`,
    'i',
  );
  const bindMatch = normalized.match(bindPattern);
  if (bindMatch) {
    const gate = parseGateName(bindMatch[1]);
    if (!gate) return null;
    return {
      gate,
      inputTokens: extractRawWireTokens(bindMatch[2]),
      outputToken: bindMatch[3],
    };
  }

  const reverseBindPattern = new RegExp(
    `\\b(?:connect|wire|bind)\\s+((?:${WIRE_TOKEN})(?:\\s+(?:and\\s+)?(?:${WIRE_TOKEN}))*)\\s+to\\s+(${WIRE_TOKEN})\\s+(?:with|using|via)\\s+(${GATE_NAMES})\\b`,
    'i',
  );
  const reverseMatch = normalized.match(reverseBindPattern);
  if (reverseMatch) {
    const gate = parseGateName(reverseMatch[3]);
    if (!gate) return null;
    return {
      gate,
      inputTokens: extractRawWireTokens(reverseMatch[1]),
      outputToken: reverseMatch[2],
    };
  }

  const gateOnPattern = new RegExp(
    `\\b(${GATE_NAMES})\\s+(?:gate\\s+)?on\\s+((?:${WIRE_TOKEN})(?:\\s+(?:and\\s+)?(?:${WIRE_TOKEN}))*)\\s+(?:to|into|onto|targeting|->)\\s+(${WIRE_TOKEN})`,
    'i',
  );
  const onMatch = normalized.match(gateOnPattern);
  if (onMatch) {
    const gate = parseGateName(onMatch[1]);
    if (!gate) return null;
    return {
      gate,
      inputTokens: extractRawWireTokens(onMatch[2]),
      outputToken: onMatch[3],
    };
  }

  const gateFromToPattern = new RegExp(
    `\\b(${GATE_NAMES})\\s+from\\s+((?:${WIRE_TOKEN})(?:\\s+(?:and\\s+)?(?:${WIRE_TOKEN}))*)\\s+to\\s+(${WIRE_TOKEN})`,
    'i',
  );
  const fromToMatch = normalized.match(gateFromToPattern);
  if (fromToMatch) {
    const gate = parseGateName(fromToMatch[1]);
    if (!gate) return null;
    return {
      gate,
      inputTokens: extractRawWireTokens(fromToMatch[2]),
      outputToken: fromToMatch[3],
    };
  }

  const naturalPattern = new RegExp(
    `(?:add|insert|put|use|apply)\\s+(?:a\\s+)?(${GATE_NAMES})(?:\\s+gate)?(?:\\s+(?:with|from|using))?\\s+(.+?)(?:\\s+(?:to|into|onto|->|output|-O)\\s+(${WIRE_TOKEN}))?$`,
    'i',
  );
  const naturalMatch = normalized.match(naturalPattern);
  if (naturalMatch) {
    const gate = parseGateName(naturalMatch[1]);
    if (!gate) return null;
    return {
      gate,
      inputTokens: extractRawWireTokens(naturalMatch[2]),
      outputToken: naturalMatch[3],
    };
  }

  return null;
};

const buildGateCommandFromDraft = (
  draft: GateBindingDraft,
  context: NlCorrectionContext,
  tokenOverrides: Map<string, string>,
) => {
  const inputs = draft.inputTokens.map((token) => (
    resolveWireAddressOr(tokenOverrides.get(token) ?? token, context)
  ));
  if (!draft.outputToken) {
    return `add ${draft.gate} from ${inputs.join(' ')}`;
  }
  const output = resolveWireAddressOr(tokenOverrides.get(draft.outputToken) ?? draft.outputToken, context);
  return `${draft.gate} -I ${inputs.join(' ')} -O ${output}`;
};

const detectGateAddressClarification = (message: string, context: NlCorrectionContext) => {
  const draft = extractGateBindingDraft(message);
  if (!draft) return null;

  const tokens = [...draft.inputTokens];
  if (draft.outputToken) tokens.push(draft.outputToken);

  for (const token of tokens) {
    const resolution = resolveWireAddress(token, context);
    if (resolution.status !== 'clarify') continue;
    return buildClarificationIntent(
      resolution.prompt,
      resolution.candidates.map((address) => ({
        label: formatAddressLabel(address, context),
        command: buildGateCommandFromDraft(draft, context, new Map([[token, address]])),
      })),
    );
  }

  return null;
};

// Partial gate commands with multiple possible outputs become clarification prompts instead of ambiguous guided edits.
const detectPartialGateCommand = (message: string, context: NlCorrectionContext) => {
  if (context.outputColumns.length <= 1) return null;
  const normalized = message.replace(/\s+/g, ' ').trim();
  const pattern = new RegExp(
    `(?:add|insert|put|use|apply)\\s+(?:a\\s+)?(${GATE_NAMES})(?:\\s+gate)?\\s+(?:from|with|using|on)\\s+((?:${WIRE_TOKEN})(?:\\s+(?:and\\s+)?(?:${WIRE_TOKEN}))*)(?:\\s+(?:to|into|onto|->|output|-O)\\s+(${WIRE_TOKEN}))?`,
    'i',
  );
  const match = normalized.match(pattern);
  if (!match || match[3]) return null;
  const gate = parseGateName(match[1]);
  if (!gate) return null;
  const inputs = parseTokenList(match[2], context);
  if (inputs.length === 0) return null;
  return { gate, inputs };
};

// Row hints update only matching truth-table rows, leaving unspecified inputs/outputs intact.
const parseTruthTableRowHint = (message: string, context: NlCorrectionContext): TruthTable | null => {
  if (!context.truthTable) return null;
  const whenMatch = message.match(
    /when\s+(.+?)\s*,?\s*(?:sum|output|result)?\s*(?:should\s+be|expects?|want|needs?)\s+(.+)$/i,
  );
  if (!whenMatch) return null;

  const conditionPart = whenMatch[1];
  const expectationPart = whenMatch[2];
  const assignments = new Map<string, TruthCellValue>();

  const inputPattern = /\b([A-Za-z]\w*)\s*(?:is|=|equals?)\s*(0|1|0p|1p)\b/gi;
  let inputMatch = inputPattern.exec(conditionPart);
  while (inputMatch) {
    const register = findRegister(inputMatch[1], context);
    const value = toTruthCellValue(inputMatch[2]);
    if (value) assignments.set(register, value);
    inputMatch = inputPattern.exec(conditionPart);
  }

  if (assignments.size === 0) return null;

  const outputPattern = /\b([A-Za-z]\w*|sum|cout|carry)\s*(?:is|=|should\s+be|expects?)\s*(0|1|0p|1p)\b/gi;
  let outputMatch = outputPattern.exec(expectationPart);
  while (outputMatch) {
    let register = outputMatch[1];
    if (/^sum$/i.test(register)) register = context.outputColumns.find((name) => /sum/i.test(name)) ?? register;
    if (/^(cout|carry)$/i.test(register)) register = context.outputColumns.find((name) => /cout|carry/i.test(name)) ?? register;
    const value = toTruthCellValue(outputMatch[2]);
    if (value) assignments.set(findRegister(register, context), value);
    outputMatch = outputPattern.exec(expectationPart);
  }

  const nextRows = context.truthTable.rows.map((row) => {
    const matches = context.inputColumns.every((column, index) => {
      const expected = assignments.get(column);
      return expected === undefined || row[index] === expected;
    });
    if (!matches) return row;
    return row.map((cell, index) => {
      if (index < context.inputColumns.length) return cell;
      const column = context.truthTable!.outputColumns[index - context.inputColumns.length];
      return assignments.get(column) ?? cell;
    });
  });

  return { ...context.truthTable, rows: nextRows };
};

// The rule parser is the first line of defense before optional LLM parsing is considered by the caller.
export const parseNaturalLanguageCorrection = (
  message: string,
  context: NlCorrectionContext,
): ModelCorrectionIntent => {
  const text = message.trim();
  if (!text) {
    return {
      reply: 'Tell me what to change. For example: "add a CNOT from A to Sum", "CNOT -I 0:0 -O Sum:0", or "open single-bit-full-adder.qpucir".',
    };
  }

  const lower = text.toLowerCase();
  // Shared extraction happens before intent dispatch so actions can combine gate hints, preferences, and table edits.
  const preferredGates = extractPreferredGates(text);
  const gates = extractGateSpecs(text, context);
  const truthTable = parseTruthTableRowHint(text, context) ?? undefined;

  // Static regex patterns are tried in priority order before any model call so
  // that common, well-formed commands (help, load, catalog open, update, test,
  // gate bindings) resolve cheaply without an LLM round-trip. Order is
  // intentional — earlier branches win; more-specific patterns beat broad fallbacks.
  if (/(?:help|what can you do|examples?)/i.test(lower)) {
    return {
      reply: [
        'I can translate natural language into circuit corrections. Try:',
        '• "open single-bit-full-adder.qpucir" or "open SingleBitFullAdder"',
        '• "CNOT -I 0:0 -O Sum:0" or "connect 0:0 to Sum:0 with CNOT"',
        '• "Test the circuit against the truth table"',
        '• "Add a CNOT from A to Sum"',
        '• "Insert CCNOT with inputs A and B into Cout"',
        '• "Fix the circuit automatically"',
        '• "update qpuio", "update qpucir", or "update both qpucir and qpuio"',
      ].join('\n'),
    };
  }

  if (/(?:load|use)\s+(?:the\s+)?(?:full[- ]?adder|adder)\s+truth\s+table/i.test(lower)) {
    return {
      reply: 'Loaded the canonical single-bit full adder truth table.',
      loadFullAdderTable: true,
    };
  }

  const catalogTarget = parseCatalogOpenTarget(text);
  if (catalogTarget) {
    const candidates = findCatalogCandidates(catalogTarget);
    if (candidates.length === 1) {
      const entry = candidates[0];
      const label = entry.fileName ?? entry.name;
      return {
        reply: `Loaded ${entry.name} from the process catalog (${label}).`,
        loadCatalogProcess: entry.name,
      };
    }
    if (candidates.length > 1) {
      return buildClarificationIntent(
        `Several catalog processes match "${catalogTarget}".`,
        candidates.map((entry) => ({
          label: `${entry.name}${entry.fileName ? ` (${entry.fileName})` : ''} [${entry.origin}]`,
          command: `open ${entry.name}`,
        })),
      );
    }
  }

  // Catalog-save phrases are mutually exclusive so a single "update qpuio" does not also rewrite qpucir.
  const updateBoth = /update\s+both\s+(?:qpucir\s+and\s+qpuio|qpuio\s+and\s+qpucir)/i.test(lower)
    || /update\s+(?:qpucir\s+and\s+qpuio|qpuio\s+and\s+qpucir)/i.test(lower);
  const updateQpuioOnly = !updateBoth && /update\s+(?:the\s+)?qpuio(?:\s+file)?/i.test(lower);
  const updateQpucirOnly = !updateBoth && /update\s+(?:the\s+)?qpucir(?:\s+file)?/i.test(lower);

  if (updateBoth || updateQpuioOnly || updateQpucirOnly) {
    const targets = updateBoth
      ? 'the .qpucir protocol and .qpuio truth table'
      : updateQpuioOnly
        ? 'the .qpuio truth table'
        : 'the .qpucir protocol';
    return {
      reply: `Saved ${targets} for the active process in the catalog.`,
      updateQpuio: updateBoth || updateQpuioOnly,
      updateQpucir: updateBoth || updateQpucirOnly,
    };
  }

  // Dimension inference is a catalog helper; it does not mutate the active circuit by itself.
  if (/(?:infer|create|build).*(?:truth table|table dimensions)/i.test(lower)) {
    return {
      reply: 'Inferred truth-table dimensions from the uploaded protocol PARAMS and RETURNVALS.',
      inferTable: true,
    };
  }

  // Output probing simulates each truth-table row and is intentionally separate from runTest guidance.
  if (/(?:probe|read|fill).*(?:output|circuit)/i.test(lower)) {
    return {
      reply: 'Probed output columns by simulating the current circuit for each input row.',
      probeOutputs: true,
    };
  }

  // Autonomous correction may still honor extracted gate preferences when the user named them explicitly.
  if (/(?:fix|correct|repair|update).*(?:automatically|autonomous|on its own|without me)/i.test(lower)
    || /(?:auto|autonomous)(?:matically)?\s+correct/i.test(lower)) {
    return {
      reply: gates.length > 0
        ? `Applying your gate preference, then correcting the circuit autonomously.`
        : 'Running autonomous correction against the truth table.',
      guidance: { preferredGates: preferredGates.length ? preferredGates : undefined, gates: gates.length ? gates : undefined },
      autonomous: true,
      runTest: true,
    };
  }

  // Guided test runs reuse the same gate extraction as autonomous mode but never set autonomous: true.
  if (/(?:test|check|verify|validate).*(?:circuit|truth|table|module)/i.test(lower) || /^run\b/i.test(lower)) {
    return {
      reply: gates.length > 0
        ? 'Testing the circuit with your guided gate insertion.'
        : 'Testing the circuit against the current truth table.',
      guidance: gates.length > 0 || preferredGates.length > 0
        ? { gates: gates.length ? gates : undefined, preferredGates: preferredGates.length ? preferredGates : undefined }
        : undefined,
      runTest: true,
      autonomous: false,
    };
  }

  // Ambiguous wire names become clarification intents instead of guessing and editing the wrong register.
  const addressClarification = detectGateAddressClarification(text, context);
  if (addressClarification) {
    return addressClarification;
  }

  // context.truthTable gates the row-hint branch above; context.outputColumns
  // determines whether the partial-gate path asks a clarification question or
  // infers the single output automatically (detectPartialGateCommand returns
  // null when outputColumns.length <= 1).
  const partialGate = detectPartialGateCommand(text, context);
  if (partialGate && gates.length === 0) {
    return buildClarificationIntent(
      `Which output should ${partialGate.gate} drive?`,
      context.outputColumns.map((column) => {
        const output = findRegister(column, context);
        return {
          label: `${partialGate.gate} -I ${partialGate.inputs.join(' ')} -O ${output}`,
          command: `${partialGate.gate} -I ${partialGate.inputs.join(' ')} -O ${output}`,
        };
      }),
    );
  }

  // Fully bound gates become guided edits immediately; unresolved/partial gates above ask for clarification first.
  if (gates.length > 0) {
    const gateSummary = gates
      .map((spec) => `${spec.gate} -I ${spec.inputs.join(' ')} -O ${spec.output}`)
      .join('; ');
    return {
      reply: `Understood. I will insert: ${gateSummary}${preferredGates.length ? ` (preferring ${preferredGates.join(', ')})` : ''}.`,
      guidance: { gates, preferredGates: preferredGates.length ? preferredGates : undefined },
      runTest: true,
      autonomous: false,
    };
  }

  // Row edits from parseTruthTableRowHint apply even when no gate bindings were parsed.
  if (truthTable) {
    return {
      reply: 'Updated the truth table row(s) matching your description.',
      truthTable,
      runTest: true,
      autonomous: false,
    };
  }

  // Gate mentions without bindings only record preference; they do not schedule a correction run.
  if (preferredGates.length > 0) {
    return {
      reply: `Noted preferred gates: ${preferredGates.join(', ')}. Say "fix automatically" to apply them during correction.`,
      guidance: { preferredGates },
    };
  }

  const mentionedGate = text.match(gatePattern)?.[0];
  if (mentionedGate) {
    const gate = parseGateName(mentionedGate);
    if (gate) {
      return {
        reply: `I recognized a ${gate} gate. Specify bindings, e.g. "${gate} -I 0:0 -O Sum:0" or "connect 0:0 to Sum:0 with ${gate}".`,
      };
    }
  }

  return {
    reply: 'I could not map that request to a correction yet. Try mentioning a gate (CNOT, CCNOT), qubit bindings (-I / -O), registers (A, Sum, Cout), or say "open single-bit-full-adder.qpucir".',
  };
};

// This exact local fallback reply is the handoff signal for optional model parsing in correctionIntentParser.
export const isRegexFallbackIntent = (intent: ModelCorrectionIntent) => (
  !intent.clarification && intent.reply.startsWith('I could not map that request')
);

export const isClarificationIntent = (intent: ModelCorrectionIntent) => (
  Boolean(intent.clarification?.options.length)
);
