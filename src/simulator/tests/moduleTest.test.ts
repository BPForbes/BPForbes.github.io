import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { correctCircuit, runModuleTest, synthesizeProtocolFromTruthTable } from '../moduleTestApi';
import {
  createEmptyTruthTable,
  describeTruthTableDimensions,
  formatTruthTableRowSummary,
  inferTruthTableDimensions,
  resizeTruthTable,
  singleBitFullAdderTruthTable,
  testCircuitAgainstTruthTable,
  truthTablesEqual,
  validateTruthTable,
} from '../truthTable';

const readProcess = (fileName: string) => readFileSync(new URL(`../../data/processes/${fileName}`, import.meta.url), 'utf8');

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

const rsNorLatchStepSource = `PARAMS: S:state R:state Qprev:state QbarPrev:state

MAIN-PROCESS RsNorLatchStep
CREATETOKEN -I Q Qbar

SET Q:0 0p
OR  -I $R QbarPrev:0 -O Q:0
NOT -I Q:0        -O Q:0

SET Qbar:0 0p
OR  -I $S Qprev:0 -O Qbar:0
NOT -I Qbar:0     -O Qbar:0

MEASURE -I Q
MEASURE -I Qbar
RETURNVALS Q Qbar`;

const rsNorLatchStepTable = {
  inputColumns: ['S', 'R', 'Qprev', 'QbarPrev'],
  outputColumns: ['Q', 'Qbar'],
  rows: [
    ['0p', '0p', '1p', '0p', '1p', '0p'],
    ['0p', '0p', '0p', '1p', '0p', '1p'],
    ['0p', '1p', '1p', '0p', '0p', '1p'],
    ['0p', '1p', '0p', '1p', '0p', '1p'],
    ['1p', '0p', '0p', '1p', '1p', '0p'],
    ['1p', '0p', '1p', '0p', '1p', '0p'],
    ['1p', '1p', '1p', '0p', '0p', '0p'],
    ['1p', '1p', '0p', '1p', '0p', '0p'],
  ],
};

describe('partial truth tables', () => {
  it('accepts fewer rows than the full combinatorial PARAMS expansion', () => {
    expect(validateTruthTable(rsNorLatchStepTable, rsNorLatchStepSource)).toEqual([]);
  });

  it('rejects zero listed rows', () => {
    const empty = { ...rsNorLatchStepTable, rows: [] };
    expect(validateTruthTable(empty, rsNorLatchStepSource)).toContain(
      'Truth table requires at least one row.',
    );
  });

  it('rejects more listed rows than the combinatorial maximum', () => {
    const overMax = {
      ...rsNorLatchStepTable,
      rows: Array.from({ length: 17 }, (_, index) => (
        rsNorLatchStepTable.rows[index % rsNorLatchStepTable.rows.length]
      )),
    };
    expect(validateTruthTable(overMax, rsNorLatchStepSource)).toContain(
      'Truth table has 17 row(s); expected at most 16.',
    );
  });

  it('describes partial dimensions with listed and combinatorial row counts', () => {
    const dimensions = describeTruthTableDimensions(rsNorLatchStepSource, rsNorLatchStepTable);
    expect(dimensions).toMatchObject({
      rowCount: 16,
      listedRowCount: 8,
      isPartial: true,
    });
    expect(formatTruthTableRowSummary(dimensions)).toBe('8 of 16 rows (partial)');
  });

  it('rejects duplicate input rows in partial tables', () => {
    const duplicate = {
      ...rsNorLatchStepTable,
      rows: [...rsNorLatchStepTable.rows, rsNorLatchStepTable.rows[0]],
    };
    expect(validateTruthTable(duplicate, rsNorLatchStepSource)).toContain(
      'Row 8 duplicates the input pattern from row 0.',
    );
  });

  it('preserves partial row count when resizing output columns', () => {
    const resized = resizeTruthTable(rsNorLatchStepTable, rsNorLatchStepTable.inputColumns, ['Q', 'Qbar', 'Hold']);
    expect(resized.rows).toHaveLength(8);
    expect(resized.outputColumns).toEqual(['Q', 'Qbar', 'Hold']);
    expect(resized.rows[0]).toEqual(['0p', '0p', '1p', '0p', '1p', '0p', '0p']);
  });

  it('runs tests only across listed partial rows', () => {
    const result = testCircuitAgainstTruthTable(rsNorLatchStepSource, rsNorLatchStepTable);
    expect(result.totalRows).toBe(8);
    expect(result.dimensions).toMatchObject({
      rowCount: 16,
      listedRowCount: 8,
      isPartial: true,
    });
  });

  it('synthesizes circuits from partial tables with arbitrary input rows', () => {
    const table = {
      inputColumns: ['A', 'B'],
      outputColumns: ['Y'],
      rows: [
        ['0p', '1p', '1p'],
        ['1p', '0p', '1p'],
      ],
    };
    const synthesized = synthesizeProtocolFromTruthTable(table, 'PartialMinterm');
    const result = testCircuitAgainstTruthTable(synthesized, table);
    expect(result.passed).toBe(true);
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

  it('returns failures without correction when correct=false', () => {
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
      correct: false,
    });
    expect(response.testResult.passed).toBe(false);
    expect(response.correctedSource).toBeUndefined();
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
