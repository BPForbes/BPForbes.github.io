import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { parseNaturalLanguageCorrection } from './naturalLanguageCorrector';
import { singleBitFullAdderTruthTable } from './truthTable';

const singleBitSource = readFileSync(new URL('../data/processes/single-bit-full-adder.qpucir', import.meta.url), 'utf8');

describe('parseNaturalLanguageCorrection', () => {
  const context = {
    source: singleBitSource,
    truthTable: singleBitFullAdderTruthTable(),
    inputColumns: ['A', 'B', 'Cin'],
    outputColumns: ['Cout', 'Sum'],
  };

  it('maps add CNOT from A to Sum into guided gate specs', () => {
    const intent = parseNaturalLanguageCorrection('add a CNOT from A to Sum', context);
    expect(intent.guidance?.gates).toEqual([{ gate: 'CNOT', inputs: ['A'], output: 'Sum' }]);
    expect(intent.runTest).toBe(true);
  });

  it('maps CCNOT with multiple inputs into Cout', () => {
    const intent = parseNaturalLanguageCorrection('insert CCNOT with inputs A and B into Cout', context);
    expect(intent.guidance?.gates).toEqual([{ gate: 'CCNOT', inputs: ['A', 'B'], output: 'Cout' }]);
  });

  it('recognizes autonomous correction requests', () => {
    const intent = parseNaturalLanguageCorrection('fix the circuit automatically', context);
    expect(intent.autonomous).toBe(true);
    expect(intent.runTest).toBe(true);
  });

  it('loads the full adder truth table', () => {
    const intent = parseNaturalLanguageCorrection('load the full adder truth table', context);
    expect(intent.loadFullAdderTable).toBe(true);
  });

  it('updates truth-table rows from natural language', () => {
    const intent = parseNaturalLanguageCorrection(
      'when A is 1 and B is 1 and Cin is 0, Sum should be 0 and Cout should be 1',
      context,
    );
    expect(intent.truthTable).toBeTruthy();
    const row = intent.truthTable!.rows.find((candidate) => candidate[0] === '1p' && candidate[1] === '1p' && candidate[2] === '0p');
    expect(row).toEqual(['1p', '1p', '0p', '1p', '0p']);
  });
});
