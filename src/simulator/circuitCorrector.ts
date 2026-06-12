import {
  TruthTable,
  singleBitFullAdderTruthTable,
  testCircuitAgainstTruthTable,
  truthTablesEqual,
} from './truthTable';

export type GatePreference = 'CNOT' | 'CCNOT' | 'X' | 'H' | 'NOT' | 'AND' | 'OR' | 'XOR';

export type GuidedGateSpec = {
  gate: GatePreference;
  inputs: string[];
  output: string;
};

export type CorrectionGuidance = {
  preferredGates?: GatePreference[];
  gates?: GuidedGateSpec[];
};

export type CorrectionStep = {
  kind: 'replace' | 'insert-gate' | 'synthesize';
  description: string;
};

export type CircuitCorrectionResult = {
  corrected: boolean;
  source: string;
  steps: CorrectionStep[];
  testResult: ReturnType<typeof testCircuitAgainstTruthTable>;
};

const stripRef = (token: string) => token.replace(/^\$/, '').split(':')[0];

// Minterm rows are the input combinations where a given output column is '1p'; synthesis gates target exactly these.
const mintermInputRows = (
  outputColumnIndex: number,
  rows: TruthTable['rows'],
  inputWidth: number,
) => rows
  .filter((row) => row[inputWidth + outputColumnIndex] === '1p')
  .map((row) => row.slice(0, inputWidth));

// Controls pair each input name with a boolean so appendMintermGate can flip zero-valued inputs before the gate fires.
const mintermControlsFromInputs = (inputs: TruthTable['rows'][number], inputNames: string[]) =>
  inputNames.map((name, index) => ({
    name,
    value: inputs[index] === '1p',
  }));

const formatRef = (name: string, cycle = 0) => {
  if (/^\d+:\d+$/.test(name)) return name;
  return name.startsWith('$') ? `${name}:${cycle}` : `$${stripRef(name)}:${cycle}`;
};

// The full-adder table is common enough to merit a readable canonical repair before generic synthesis.
const buildFullAdderSource = (processName: string, inputs: string[], outputs: string[]) => {
  const [a, b, cin] = inputs;
  const [cout, sum] = outputs;
  return `PARAMS: ${inputs.map((name) => `${name}:state`).join(' ')}

MAIN-PROCESS ${processName}
CREATETOKEN -I ${sum} ${cout}

SET 0:0 $${a}
SET 1:0 $${b}
SET 2:0 $${cin}
SET ${sum}:0 0p
SET ${cout}:0 0p

CNOT -I 0:0 -O ${sum}:0
CNOT -I 1:0 -O ${sum}:0
CNOT -I 2:0 -O ${sum}:0

CCNOT -I 0:0 1:0 -O ${cout}:0
CCNOT -I 0:0 2:0 -O ${cout}:0
CCNOT -I 1:0 2:0 -O ${cout}:0

MEASURE -I ${cout}
MEASURE -I ${sum}
RETURNVALS ${cout} ${sum}
`;
};

// XOR parity detection lets synthesis emit a compact CNOT chain instead of one gate per minterm.
const isXorParityOutput = (
  inputNames: string[],
  rows: TruthTable['rows'],
  inputWidth: number,
  outputColumnIndex: number,
) => rows.every((row) => {
  const ones = row.slice(0, inputWidth).filter((cell) => cell === '1p').length;
  const expected = ones % 2 === 1 ? '1p' : '0p';
  return row[inputWidth + outputColumnIndex] === expected;
});

// Majority detection recognizes the carry-out pattern for 3-input adders and maps it to three CCNOT pairs.
const isPairwiseMajorityOutput = (
  inputNames: string[],
  rows: TruthTable['rows'],
  inputWidth: number,
  outputColumnIndex: number,
) => {
  if (inputNames.length !== 3) return false;
  return rows.every((row) => {
    const ones = row.slice(0, inputWidth).filter((cell) => cell === '1p').length;
    const expected = ones >= 2 ? '1p' : '0p';
    return row[inputWidth + outputColumnIndex] === expected;
  });
};

// Minterm synthesis flips zero-valued controls into positive controls, applies one gate, then restores inputs.
const appendMintermGate = (
  lines: string[],
  inputNames: string[],
  inputs: TruthTable['rows'][number],
  outputRef: string,
  preferredGates: GatePreference[],
) => {
  const controlSpec = mintermControlsFromInputs(inputs, inputNames);
  const zeroControls = controlSpec.filter((control) => !control.value).map((control) => formatRef(control.name, 0));
  const oneControls = controlSpec.filter((control) => control.value).map((control) => formatRef(control.name, 0));

  zeroControls.forEach((ref) => {
    lines.push(`X -I ${ref} -O ${ref}`);
  });

  const allControls = [...zeroControls, ...oneControls];
  if (allControls.length === 0) {
    lines.push(`X -I ${outputRef} -O ${outputRef}`);
  } else if (allControls.length === 1 && preferredGates.includes('CNOT')) {
    lines.push(`CNOT -I ${allControls[0]} -O ${outputRef}`);
  } else {
    lines.push(`CCNOT -I ${allControls.join(' ')} -O ${outputRef}`);
  }

  zeroControls.forEach((ref) => {
    lines.push(`X -I ${ref} -O ${ref}`);
  });
};

// Output synthesis selects the most compact gate pattern available before falling back to a full minterm expansion.
const synthesizeOutputGates = (
  inputNames: string[],
  outputName: string,
  rows: TruthTable['rows'],
  inputWidth: number,
  outputColumnIndex: number,
  preferredGates: GatePreference[],
) => {
  const lines: string[] = [];
  const activeMinterms = mintermInputRows(outputColumnIndex, rows, inputWidth);
  const outputRef = `${outputName}:0`;

  if (activeMinterms.length === 0) {
    lines.push(`SET ${outputRef} 0p`);
    return lines;
  }

  // Recognized parity and majority outputs use compact gate patterns instead of a full minterm expansion.
  if (isXorParityOutput(inputNames, rows, inputWidth, outputColumnIndex) && preferredGates.includes('CNOT')) {
    lines.push(`SET ${outputRef} 0p`);
    inputNames.forEach((name) => {
      lines.push(`CNOT -I ${formatRef(name, 0)} -O ${outputRef}`);
    });
    return lines;
  }

  if (isPairwiseMajorityOutput(inputNames, rows, inputWidth, outputColumnIndex) && preferredGates.includes('CCNOT')) {
    lines.push(`SET ${outputRef} 0p`);
    lines.push(`CCNOT -I ${formatRef(inputNames[0], 0)} ${formatRef(inputNames[1], 0)} -O ${outputRef}`);
    lines.push(`CCNOT -I ${formatRef(inputNames[0], 0)} ${formatRef(inputNames[2], 0)} -O ${outputRef}`);
    lines.push(`CCNOT -I ${formatRef(inputNames[1], 0)} ${formatRef(inputNames[2], 0)} -O ${outputRef}`);
    return lines;
  }

  lines.push(`SET ${outputRef} 0p`);
  activeMinterms.forEach((inputs) => {
    appendMintermGate(lines, inputNames, inputs, outputRef, preferredGates);
  });

  return lines;
};

export const synthesizeProtocolFromTruthTable = (
  table: TruthTable,
  processName = 'SynthesizedCircuit',
  guidance: CorrectionGuidance = {},
): string => {
  const preferredGates = guidance.preferredGates ?? ['CNOT', 'CCNOT', 'X'];
  const inputWidth = table.inputColumns.length;
  const gateLines: string[] = [];

  table.outputColumns.forEach((outputName, outputIndex) => {
    gateLines.push(...synthesizeOutputGates(
      table.inputColumns,
      outputName,
      table.rows,
      inputWidth,
      outputIndex,
      preferredGates,
    ));
  });

  // Synthesized protocols reset inputs/outputs, apply gates, then measure only declared outputs for table comparison.
  const cycleSets = table.inputColumns.map((name) => `SET ${formatRef(name, 0)} 0p`);
  const outputResets = table.outputColumns.map((name) => `SET ${name}:0 0p`);
  const measures = table.outputColumns.map((name) => `MEASURE -I ${name}:0`);
  const returns = table.outputColumns.map((name) => `${name}:0`).join(' ');

  return [
    `PARAMS: ${table.inputColumns.map((name) => `${name}:state`).join(' ')}`,
    '',
    `MAIN-PROCESS ${processName}`,
    `CREATETOKEN -I ${table.outputColumns.join(' ')}`,
    '',
    ...cycleSets,
    ...outputResets,
    '',
    ...gateLines,
    '',
    ...measures,
    '',
    `RETURNVALS ${returns}`,
    '',
  ].join('\n');
};

// Guided gates are inserted before measurement/returns so the user's requested edit affects observable outputs.
const insertGuidedGates = (source: string, gates: GuidedGateSpec[]) => {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const anchor = lines.findIndex((line) => /^\s*(MEASURE|RETURNVALS)\b/i.test(line));
  const insertAt = anchor >= 0 ? anchor : lines.length;
  const gateLines = gates.map((spec) => {
    const inputs = spec.inputs.map((token) => formatRef(stripRef(token), 0)).join(' ');
    const output = `${stripRef(spec.output)}:0`;
    if (spec.gate === 'X' || spec.gate === 'H' || spec.gate === 'NOT') {
      return `${spec.gate} -I ${output} -O ${output}`;
    }
    return `${spec.gate} -I ${inputs} -O ${output}`;
  });
  lines.splice(insertAt, 0, ...gateLines, '');
  return lines.join('\n');
};

// Full-adder identity check avoids minterm synthesis for the most common binary adder truth table.
const matchesFullAdder = (table: TruthTable) => truthTablesEqual(table, singleBitFullAdderTruthTable());

export const correctCircuit = (
  source: string,
  table: TruthTable,
  librarySources: Record<string, string> = {},
  guidance: CorrectionGuidance = {},
  options: { maxIterations?: number; autonomous?: boolean } = {},
): CircuitCorrectionResult => {
  const maxIterations = options.maxIterations ?? 8;
  const autonomous = options.autonomous ?? true;
  const steps: CorrectionStep[] = [];
  let current = source;
  let activeGuidance = { ...guidance };

  // Correction escalates from exact template, to user-guided edits, to autonomous truth-table synthesis.
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const testResult = testCircuitAgainstTruthTable(current, table, librarySources);
    if (testResult.passed) {
      return { corrected: steps.length > 0, source: current, steps, testResult };
    }

    if (iteration === 0 && matchesFullAdder(table)) {
      const processName = extractProcessNameFromSource(current);
      const corrected = buildFullAdderSource(processName, table.inputColumns, table.outputColumns);
      steps.push({ kind: 'replace', description: 'Applied canonical single-bit full adder template.' });
      current = corrected;
      continue;
    }

    if (activeGuidance.gates?.length) {
      current = insertGuidedGates(current, activeGuidance.gates);
      steps.push({
        kind: 'insert-gate',
        description: `Inserted guided gate(s): ${activeGuidance.gates.map((gate) => gate.gate).join(', ')}.`,
      });
      activeGuidance = { ...activeGuidance, gates: undefined };
      continue;
    }

    // Without autonomous mode the caller applies guided gates manually and decides whether to escalate further.
    if (!autonomous) {
      break;
    }

    const synthesized = synthesizeProtocolFromTruthTable(
      table,
      extractProcessNameFromSource(current),
      activeGuidance,
    );
    current = synthesized;
    steps.push({ kind: 'synthesize', description: 'Replaced circuit body with truth-table synthesis.' });
  }

  const testResult = testCircuitAgainstTruthTable(current, table, librarySources);
  return { corrected: testResult.passed, source: current, steps, testResult };
};

// Process name is preserved across correction passes so synthesized circuits keep the user's original label.
const extractProcessNameFromSource = (source: string) => {
  const line = source.replace(/\r\n/g, '\n').split('\n').find((candidate) => /^\s*MAIN-PROCESS\s+/i.test(candidate));
  return line?.split(/\s+/)[1] ?? 'CorrectedCircuit';
};

export { fillTruthTableFromCircuit as inferTruthTableWithOutputs } from './truthTable';
