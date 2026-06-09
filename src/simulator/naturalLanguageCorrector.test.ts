import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { buildProcessCatalogSummaries } from '../data/processCatalog';
import { parseNaturalLanguageCorrection } from './naturalLanguageCorrector';
import { singleBitFullAdderTruthTable } from './truthTable';

const singleBitSource = readFileSync(new URL('../data/processes/single-bit-full-adder.qpucir', import.meta.url), 'utf8');

describe('parseNaturalLanguageCorrection', () => {
  const context = {
    source: singleBitSource,
    truthTable: singleBitFullAdderTruthTable(),
    inputColumns: ['A', 'B', 'Cin'],
    outputColumns: ['Cout', 'Sum'],
    processCatalog: buildProcessCatalogSummaries(),
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

  it('parses AST-style qubit bindings', () => {
    const intent = parseNaturalLanguageCorrection('CNOT -I 0:0 -O Sum:0', context);
    expect(intent.guidance?.gates).toEqual([{ gate: 'CNOT', inputs: ['0:0'], output: 'Sum:0' }]);
  });

  it('parses multi-control AST bindings', () => {
    const intent = parseNaturalLanguageCorrection('CCNOT -I 0:0 1:0 -O Cout:0', context);
    expect(intent.guidance?.gates).toEqual([{ gate: 'CCNOT', inputs: ['0:0', '1:0'], output: 'Cout:0' }]);
  });

  it('parses connect wire to output with gate', () => {
    const intent = parseNaturalLanguageCorrection('connect 0:0 to Sum:0 with CNOT', context);
    expect(intent.guidance?.gates).toEqual([{ gate: 'CNOT', inputs: ['0:0'], output: 'Sum:0' }]);
  });

  it('parses gate-on bindings', () => {
    const intent = parseNaturalLanguageCorrection('CNOT on 0:0 targeting Sum:0', context);
    expect(intent.guidance?.gates).toEqual([{ gate: 'CNOT', inputs: ['0:0'], output: 'Sum:0' }]);
  });

  it('opens catalog processes by filename', () => {
    const intent = parseNaturalLanguageCorrection('open single-bit-full-adder.qpucir', context);
    expect(intent.loadCatalogProcess).toBe('SingleBitFullAdder');
  });

  it('opens catalog processes by filename stem', () => {
    const intent = parseNaturalLanguageCorrection('load single-bit-full-adder', context);
    expect(intent.loadCatalogProcess).toBe('SingleBitFullAdder');
  });

  it('asks for clarification when several catalog processes match', () => {
    const intent = parseNaturalLanguageCorrection('open adder', context);
    expect(intent.clarification?.options.length).toBeGreaterThan(1);
    expect(intent.reply).toContain('Do you mean?');
  });

  it('asks which output to use when a gate omits -O', () => {
    const intent = parseNaturalLanguageCorrection('add CNOT from A', context);
    expect(intent.clarification?.options).toEqual([
      { label: 'CNOT -I A -O Cout', command: 'CNOT -I A -O Cout' },
      { label: 'CNOT -I A -O Sum', command: 'CNOT -I A -O Sum' },
    ]);
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
