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

const mintermIndices = (inputCount: number, outputColumnIndex: number, rows: TruthTable['rows'], inputWidth: number) =>
  rows
    .map((row, index) => ({ index, output: row[inputWidth + outputColumnIndex] }))
    .filter(({ output }) => output === '1p')
    .map(({ index }) => index);

const mintermControls = (rowIndex: number, inputCount: number, inputNames: string[]) =>
  Array.from({ length: inputCount }, (_, bit) => ({
    name: inputNames[bit],
    value: ((rowIndex >> (inputCount - 1 - bit)) & 1) === 1,
  }));

const formatRef = (name: string, cycle = 0) => (name.startsWith('$') ? `${name}:${cycle}` : `$${stripRef(name)}:${cycle}`);

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

const synthesizeOutputGates = (
  inputNames: string[],
  outputName: string,
  rows: TruthTable['rows'],
  inputWidth: number,
  outputColumnIndex: number,
  preferredGates: GatePreference[],
) => {
  const lines: string[] = [];
  const activeMinterms = mintermIndices(inputNames.length, outputColumnIndex, rows, inputWidth);
  const outputRef = `${outputName}:0`;

  if (activeMinterms.length === 0) {
    lines.push(`SET ${outputRef} 0p`);
    return lines;
  }

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
  activeMinterms.forEach((rowIndex) => {
    const controls = mintermControls(rowIndex, inputNames.length, inputNames)
      .filter((control) => control.value)
      .map((control) => formatRef(control.name, 0));

    if (controls.length === 0) {
      lines.push(`X -I ${outputRef} -O ${outputRef}`);
      return;
    }

    if (controls.length === 1 && preferredGates.includes('CNOT')) {
      lines.push(`CNOT -I ${controls[0]} -O ${outputRef}`);
      return;
    }

    if (controls.length === 2 && preferredGates.includes('CCNOT')) {
      lines.push(`CCNOT -I ${controls[0]} ${controls[1]} -O ${outputRef}`);
      return;
    }

    if (controls.length >= 2 && preferredGates.includes('CCNOT')) {
      lines.push(`CCNOT -I ${controls.join(' ')} -O ${outputRef}`);
      return;
    }

    lines.push(`CCNOT -I ${controls.join(' ')} -O ${outputRef}`);
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

  const demoSets = table.inputColumns.map((name) => `SET ${formatRef(name)} 0p`);
  const cycleSets = table.inputColumns.map((name) => `SET ${formatRef(name, 0)} 0p`);
  const outputResets = table.outputColumns.map((name) => `SET ${name}:0 0p`);
  const measures = table.outputColumns.map((name) => `MEASURE -I ${name}:0`);
  const returns = table.outputColumns.map((name) => `${name}:0`).join(' ');

  return [
    `PARAMS: ${table.inputColumns.map((name) => `${name}:state`).join(' ')}`,
    '',
    `MAIN-PROCESS ${processName}`,
    ...demoSets,
    '',
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

    if (guidance.gates?.length) {
      current = insertGuidedGates(current, guidance.gates);
      steps.push({
        kind: 'insert-gate',
        description: `Inserted guided gate(s): ${guidance.gates.map((gate) => gate.gate).join(', ')}.`,
      });
      continue;
    }

    if (!autonomous) {
      break;
    }

    const synthesized = synthesizeProtocolFromTruthTable(
      table,
      extractProcessNameFromSource(current),
      guidance,
    );
    current = synthesized;
    steps.push({ kind: 'synthesize', description: 'Replaced circuit body with truth-table synthesis.' });
  }

  const testResult = testCircuitAgainstTruthTable(current, table, librarySources);
  return { corrected: testResult.passed, source: current, steps, testResult };
};

const extractProcessNameFromSource = (source: string) => {
  const line = source.replace(/\r\n/g, '\n').split('\n').find((candidate) => /^\s*MAIN-PROCESS\s+/i.test(candidate));
  return line?.split(/\s+/)[1] ?? 'CorrectedCircuit';
};

export { fillTruthTableFromCircuit as inferTruthTableWithOutputs } from './truthTable';
