import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { correctCircuit, runModuleTest, synthesizeProtocolFromTruthTable } from './moduleTestApi';
import {
  createEmptyTruthTable,
  inferTruthTableDimensions,
  singleBitFullAdderTruthTable,
  testCircuitAgainstTruthTable,
  truthTablesEqual,
} from './truthTable';

const readProcess = (fileName: string) => readFileSync(new URL(`../data/processes/${fileName}`, import.meta.url), 'utf8');

const protocolLibrary = {
  SingleBitFullAdder: readProcess('single-bit-full-adder.qpucir'),
  TwoBitFullAdder: readProcess('two-bit-full-adder.qpucir'),
};

describe('truth table inference', () => {
  it('infers 8x5 dimensions for SingleBitFullAdder', () => {
    const source = protocolLibrary.SingleBitFullAdder;
    expect(inferTruthTableDimensions(source)).toEqual({
      rowCount: 8,
      columnCount: 5,
      inputCount: 3,
      outputCount: 2,
    });
  });

  it('creates combinatorial input rows with placeholder outputs', () => {
    const table = createEmptyTruthTable(protocolLibrary.SingleBitFullAdder);
    expect(table.inputColumns).toEqual(['A', 'B', 'Cin']);
    expect(table.outputColumns).toEqual(['Cout', 'Sum']);
    expect(table.rows[0]).toEqual(['0p', '0p', '0p', '0p', '0p']);
    expect(table.rows[7]).toEqual(['1p', '1p', '1p', '0p', '0p']);
  });
});

describe('SingleBitFullAdder truth table conformance', () => {
  it('passes the canonical full-adder truth table', () => {
    const result = testCircuitAgainstTruthTable(
      protocolLibrary.SingleBitFullAdder,
      singleBitFullAdderTruthTable(),
      protocolLibrary,
    );
    expect(result.passed).toBe(true);
    expect(result.passedRows).toBe(8);
  });

  it('corrects a broken adder using the canonical template', () => {
    const broken = `PARAMS: A:state B:state Cin:state

MAIN-PROCESS BrokenAdder
CREATETOKEN -I Sum Cout
SET Sum:0 0p
SET Cout:0 0p
RETURNVALS Cout:0 Sum:0`;

    const correction = correctCircuit(broken, singleBitFullAdderTruthTable(), protocolLibrary);
    expect(correction.testResult.passed).toBe(true);
    expect(correction.steps.some((step) => step.kind === 'replace')).toBe(true);
  });
});

describe('module test API', () => {
  it('returns a passing response without correction for a valid module', () => {
    const response = runModuleTest({
      source: protocolLibrary.SingleBitFullAdder,
      truthTable: singleBitFullAdderTruthTable(),
      librarySources: protocolLibrary,
    });
    expect(response.testResult.passed).toBe(true);
    expect(response.correctedSource).toBeUndefined();
  });

  it('synthesizes a circuit that matches the requested truth table', () => {
    const table = singleBitFullAdderTruthTable();
    const synthesized = synthesizeProtocolFromTruthTable(table, 'SynthesizedAdder');
    const result = testCircuitAgainstTruthTable(synthesized, table, protocolLibrary);
    expect(result.passed).toBe(true);
  });

  it('synthesizes minterms with zero-valued controls', () => {
    const table = {
      inputColumns: ['A', 'B'],
      outputColumns: ['Y'],
      rows: [
        ['0p', '0p', '0p'],
        ['0p', '1p', '1p'],
        ['1p', '0p', '0p'],
        ['1p', '1p', '0p'],
      ],
    };
    const synthesized = synthesizeProtocolFromTruthTable(table, 'ZeroControlMinterm');
    const result = testCircuitAgainstTruthTable(synthesized, table, protocolLibrary);
    expect(result.passed).toBe(true);
  });

  it('autonomously corrects through runModuleTest', () => {
    const broken = `PARAMS: A:state B:state Cin:state

MAIN-PROCESS BrokenAdder
CREATETOKEN -I Sum Cout
SET Sum:0 0p
SET Cout:0 0p
RETURNVALS Cout:0 Sum:0`;

    const response = runModuleTest({
      source: broken,
      truthTable: singleBitFullAdderTruthTable(),
      librarySources: protocolLibrary,
      autonomous: true,
    });
    expect(response.testResult.passed).toBe(true);
    expect(response.correctedSource).toBeTruthy();
  });
});

describe('truth table helpers', () => {
  it('recognizes equivalent truth tables', () => {
    expect(truthTablesEqual(singleBitFullAdderTruthTable(), singleBitFullAdderTruthTable())).toBe(true);
  });
});
