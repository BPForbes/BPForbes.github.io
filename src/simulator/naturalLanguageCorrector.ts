import type { GatePreference, GuidedGateSpec } from './circuitCorrector';
import type { ModelCorrectionIntent, NlCorrectionContext } from './nlIntentTypes';
import { isTruthCellValue, type TruthCellValue, type TruthTable } from './truthTable';

export type { ModelCorrectionIntent, NlCorrectionContext, NlCorrectionIntent } from './nlIntentTypes';

const GATE_ALIASES: Record<string, GatePreference> = {
  cnot: 'CNOT',
  controllednot: 'CNOT',
  'controlled-not': 'CNOT',
  ccnot: 'CCNOT',
  toffoli: 'CCNOT',
  x: 'X',
  not: 'NOT',
  h: 'H',
  hadamard: 'H',
  and: 'AND',
  or: 'OR',
  xor: 'XOR',
};

const GATE_NAMES = Object.keys(GATE_ALIASES).join('|');
const gatePattern = new RegExp(`\\b(${GATE_NAMES})\\b`, 'gi');

const stripRef = (token: string) => token.replace(/^\$/, '').split(':')[0].trim();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toTruthCellValue = (raw: string): TruthCellValue | null => {
  const normalized = raw.endsWith('p') ? raw : `${raw}p`;
  return isTruthCellValue(normalized) ? normalized : null;
};

const findRegister = (name: string, context: NlCorrectionContext) => {
  const base = stripRef(name);
  const candidates = [...context.inputColumns, ...context.outputColumns];
  const direct = candidates.find((candidate) => candidate.toLowerCase() === base.toLowerCase());
  if (direct) return direct;

  const alias = context.source.match(new RegExp(`SET\\s+(\\d+:\\d+)\\s+\\$${escapeRegex(base)}\\b`, 'i'));
  if (alias) return alias[1];

  const wire = base.match(/^(\d+)$/);
  if (wire) {
    const wireAlias = context.source.match(new RegExp(`SET\\s+(${escapeRegex(wire[1])}:\\d+)\\s+\\$\\w+`, 'i'));
    if (wireAlias) return wireAlias[1];
  }

  return base;
};

const parseGateName = (raw: string): GatePreference | undefined => GATE_ALIASES[raw.toLowerCase().replace(/\s+/g, '')];

const extractGateSpecs = (message: string, context: NlCorrectionContext): GuidedGateSpec[] => {
  const specs: GuidedGateSpec[] = [];
  const normalized = message.replace(/\s+/g, ' ').trim();

  const commandPattern = new RegExp(
    `(?:${GATE_NAMES})\\s+-I\\s+([\\w$:,\\s]+?)\\s+-O\\s+([\\w$:]+)`,
    'gi',
  );
  let commandMatch = commandPattern.exec(normalized);
  while (commandMatch) {
    const gate = parseGateName(commandMatch[0].split(/\s+/)[0]);
    if (gate) {
      specs.push({
        gate,
        inputs: commandMatch[1].split(/\s+/).filter(Boolean).map((token) => findRegister(token, context)),
        output: findRegister(commandMatch[2], context),
      });
    }
    commandMatch = commandPattern.exec(normalized);
  }
  if (specs.length > 0) return specs;

  const naturalPattern = new RegExp(
    `(?:add|insert|put|use|apply)\\s+(?:a\\s+)?(${GATE_NAMES})(?:\\s+gate)?(?:\\s+(?:with|from|using))?\\s+(.+?)(?:\\s+(?:to|into|onto|->|output|-O)\\s+([\\w$:]+))?$`,
    'i',
  );
  const naturalMatch = normalized.match(naturalPattern);
  if (naturalMatch) {
    const gate = parseGateName(naturalMatch[1]);
    if (gate) {
      const inputPart = naturalMatch[2]
        .replace(/\s+and\s+/gi, ' ')
        .replace(/,/g, ' ')
        .trim();
      const inputs = inputPart
        .split(/\s+/)
        .filter((token) => token && !/^(with|from|inputs?)$/i.test(token))
        .map((token) => findRegister(token, context));
      const output = naturalMatch[3] ? findRegister(naturalMatch[3], context) : context.outputColumns[0];
      if (inputs.length > 0 && output) {
        specs.push({ gate, inputs, output });
      }
    }
  }

  return specs;
};

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

export const parseNaturalLanguageCorrection = (
  message: string,
  context: NlCorrectionContext,
): ModelCorrectionIntent => {
  const text = message.trim();
  if (!text) {
    return {
      reply: 'Tell me what to change. For example: "add a CNOT from A to Sum", "prefer CCNOT gates", or "fix the circuit automatically".',
    };
  }

  const lower = text.toLowerCase();
  const preferredGates = extractPreferredGates(text);
  const gates = extractGateSpecs(text, context);
  const truthTable = parseTruthTableRowHint(text, context) ?? undefined;

  if (/(?:help|what can you do|examples?)/i.test(lower)) {
    return {
      reply: [
        'I can translate natural language into circuit corrections. Try:',
        '• "Test the circuit against the truth table"',
        '• "Load the full adder truth table"',
        '• "Add a CNOT from A to Sum"',
        '• "Insert CCNOT with inputs A and B into Cout"',
        '• "Prefer CNOT and CCNOT gates"',
        '• "When A is 1 and B is 1 and Cin is 0, Sum should be 0 and Cout should be 1"',
        '• "Fix the circuit automatically"',
      ].join('\n'),
    };
  }

  const catalogProcess = context.processCatalog?.find((entry) => {
    const pattern = new RegExp(`\\b(?:load|open|use)\\s+(?:the\\s+)?${escapeRegex(entry.name)}\\b`, 'i');
    return pattern.test(text);
  });
  if (catalogProcess) {
    return {
      reply: `Loaded ${catalogProcess.name} from the process catalog.`,
      loadCatalogProcess: catalogProcess.name,
    };
  }

  if (/(?:load|use).*(?:full[- ]?adder|adder truth)/i.test(lower)) {
    return {
      reply: 'Loaded the canonical single-bit full adder truth table.',
      loadFullAdderTable: true,
    };
  }

  if (/(?:infer|create|build).*(?:truth table|table dimensions)/i.test(lower)) {
    return {
      reply: 'Inferred truth-table dimensions from the uploaded protocol PARAMS and RETURNVALS.',
      inferTable: true,
    };
  }

  if (/(?:probe|read|fill).*(?:output|circuit)/i.test(lower)) {
    return {
      reply: 'Probed output columns by simulating the current circuit for each input row.',
      probeOutputs: true,
    };
  }

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

  if (truthTable) {
    return {
      reply: 'Updated the truth table row(s) matching your description.',
      truthTable,
      runTest: true,
      autonomous: false,
    };
  }

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
        reply: `I recognized a ${gate} gate. Specify inputs and output, e.g. "add ${gate} from A and B to Cout".`,
      };
    }
  }

  return {
    reply: 'I could not map that request to a correction yet. Try mentioning a gate (CNOT, CCNOT), registers (A, Sum, Cout), or say "fix automatically".',
  };
};

export const isRegexFallbackIntent = (intent: ModelCorrectionIntent) => (
  intent.reply.startsWith('I could not map that request')
);
