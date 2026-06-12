import { compileQpuProtocol, getReturnValTokens, parseProtocol } from './qpuAst';
import { getProtocolParameterEntries } from './qpuFormat';
import { measureAll, runCircuit } from './engine';
import type { ParticleStartState } from './types';

export type TruthCellValue = '0p' | '1p' | 'sp';

export type TruthTable = {
  inputColumns: string[];
  outputColumns: string[];
  rows: TruthCellValue[][];
};

export const cloneTruthTable = (table: TruthTable): TruthTable => structuredClone(table);

// Dimensions track both the combinatorial protocol space and the rows actually listed for partial tables.
export type TruthTableDimensions = {
  /** Full combinatorial row count from PARAMS (2^n), or 1/0 when there are no state inputs. */
  rowCount: number;
  columnCount: number;
  inputCount: number;
  outputCount: number;
  /** Rows actually listed in the table, when known. */
  listedRowCount?: number;
  /** True when listed rows are fewer than the combinatorial maximum. */
  isPartial?: boolean;
};

export type TruthTableRowResult = {
  rowIndex: number;
  inputs: TruthCellValue[];
  expectedOutputs: TruthCellValue[];
  actualOutputs: TruthCellValue[];
  passed: boolean;
};

export type TruthTableTestResult = {
  passed: boolean;
  totalRows: number;
  passedRows: number;
  failedRows: TruthTableRowResult[];
  dimensions: TruthTableDimensions;
};

const VALID_CELLS = new Set<TruthCellValue>(['0p', '1p', 'sp']);

export const isTruthCellValue = (value: string): value is TruthCellValue => VALID_CELLS.has(value as TruthCellValue);

const tokenQubit = (tokenMap: Record<string, number>, name: string) => {
  const entry = Object.entries(tokenMap).find(([token]) => token === name || token.endsWith(`/${name}`));
  if (entry === undefined) throw new Error(`Missing register '${name}' in compiled token map`);
  return entry[1];
};

const setToken = (
  tokenMap: Record<string, number>,
  startStates: ParticleStartState[],
  name: string,
  value: ParticleStartState,
) => {
  startStates[tokenQubit(tokenMap, name)] = value;
};

const readMeasuredBit = (
  tokenMap: Record<string, number>,
  measurements: Record<number, 0 | 1>,
  name: string,
): TruthCellValue => (measurements[tokenQubit(tokenMap, name)] === 1 ? '1p' : '0p');

// Dimension inference reads protocol params/returns so partial tables can report what fraction of cases they cover.
export const inferTruthTableDimensions = (source: string): TruthTableDimensions => {
  const params = getProtocolParameterEntries(source).filter((param) => param.type === 'state');
  const outputs = getReturnValTokens(source);
  const inputCount = params.length;
  const outputCount = outputs.length;
  return {
    inputCount,
    outputCount,
    rowCount: inputCount > 0 ? 2 ** inputCount : (outputCount > 0 ? 1 : 0),
    columnCount: inputCount + outputCount,
  };
};

export const describeTruthTableDimensions = (
  source: string,
  table?: TruthTable | null,
): TruthTableDimensions => {
  const base = inferTruthTableDimensions(source);
  if (!table) return base;
  const listedRowCount = table.rows.length;
  return {
    ...base,
    listedRowCount,
    isPartial: listedRowCount > 0 && listedRowCount < base.rowCount,
  };
};

export const formatTruthTableRowSummary = (dimensions: TruthTableDimensions) => {
  const listed = dimensions.listedRowCount ?? dimensions.rowCount;
  if (dimensions.isPartial) {
    return `${listed} of ${dimensions.rowCount} rows (partial)`;
  }
  return `${listed} row${listed === 1 ? '' : 's'}`;
};

export const indexToInputRow = (index: number, inputCount: number): TruthCellValue[] => {
  if (inputCount === 0) return [];
  return Array.from({ length: inputCount }, (_, bit) => (((index >> (inputCount - 1 - bit)) & 1) === 1 ? '1p' : '0p'));
};

export const createTruthTableFromColumns = (inputColumns: string[], outputColumns: string[]): TruthTable => {
  const rowCount = inputColumns.length > 0 ? 2 ** inputColumns.length : (outputColumns.length > 0 ? 1 : 0);
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => [
    ...indexToInputRow(rowIndex, inputColumns.length),
    ...Array.from({ length: outputColumns.length }, () => '0p' as TruthCellValue),
  ]);
  return { inputColumns, outputColumns, rows };
};

const remapTruthTableRow = (
  previous: TruthCellValue[],
  table: TruthTable,
  inputColumns: string[],
  outputColumns: string[],
  fallbackRow: TruthCellValue[],
) => fallbackRow.map((cell, columnIndex) => {
  const nextColumn = columnIndex < inputColumns.length
    ? inputColumns[columnIndex]
    : outputColumns[columnIndex - inputColumns.length];
  const previousInputIndex = table.inputColumns.indexOf(nextColumn);
  const previousOutputIndex = table.outputColumns.indexOf(nextColumn);
  const previousIndex = previousInputIndex >= 0
    ? previousInputIndex
    : previousOutputIndex >= 0
      ? table.inputColumns.length + previousOutputIndex
      : -1;
  return previousIndex >= 0 ? (previous[previousIndex] ?? cell) : cell;
});

export const resizeTruthTable = (
  table: TruthTable,
  inputColumns: string[],
  outputColumns: string[],
): TruthTable => {
  const combinatorialRowCount = inputColumns.length > 0
    ? 2 ** inputColumns.length
    : (outputColumns.length > 0 ? 1 : 0);
  const preservePartial = table.rows.length > 0 && table.rows.length < combinatorialRowCount;

  if (preservePartial) {
    return {
      inputColumns,
      outputColumns,
      rows: table.rows.map((previous) => remapTruthTableRow(
        previous,
        table,
        inputColumns,
        outputColumns,
        [
          ...Array.from({ length: inputColumns.length }, () => '0p' as TruthCellValue),
          ...Array.from({ length: outputColumns.length }, () => '0p' as TruthCellValue),
        ],
      )),
    };
  }

  const next = createTruthTableFromColumns(inputColumns, outputColumns);
  next.rows = next.rows.map((row, rowIndex) => {
    const previous = table.rows[rowIndex];
    if (!previous) return row;
    return remapTruthTableRow(previous, table, inputColumns, outputColumns, row);
  });
  return next;
};

export const formatTestFailureSummary = (result: TruthTableTestResult) => {
  const scope = result.dimensions.isPartial
    ? `${result.totalRows} listed row(s) (${formatTruthTableRowSummary(result.dimensions)})`
    : `${result.totalRows} truth-table row(s)`;
  if (result.passed) {
    return `All ${scope} pass.`;
  }
  const details = result.failedRows.slice(0, 8).map((row) => (
    `Row ${row.rowIndex} (${row.inputs.join(', ')}): expected [${row.expectedOutputs.join(', ')}], got [${row.actualOutputs.join(', ')}]`
  ));
  const suffix = result.failedRows.length > 8
    ? ` …and ${result.failedRows.length - 8} more failing row(s).`
    : '';
  return `${result.failedRows.length} row(s) fail (${result.passedRows}/${result.totalRows} pass). ${details.join(' ')}${suffix}`;
};

export const createEmptyTruthTable = (source: string): TruthTable => {
  const dimensions = inferTruthTableDimensions(source);
  const inputColumns = getProtocolParameterEntries(source)
    .filter((param) => param.type === 'state')
    .map((param) => param.name);
  const outputColumns = getReturnValTokens(source);
  const rows = Array.from({ length: dimensions.rowCount }, (_, rowIndex) => [
    ...indexToInputRow(rowIndex, dimensions.inputCount),
    ...Array.from({ length: dimensions.outputCount }, () => '0p' as TruthCellValue),
  ]);
  return { inputColumns, outputColumns, rows };
};

export const singleBitFullAdderTruthTable = (): TruthTable => ({
  inputColumns: ['A', 'B', 'Cin'],
  outputColumns: ['Cout', 'Sum'],
  rows: [
    ['0p', '0p', '0p', '0p', '0p'],
    ['0p', '0p', '1p', '0p', '1p'],
    ['0p', '1p', '0p', '0p', '1p'],
    ['0p', '1p', '1p', '1p', '0p'],
    ['1p', '0p', '0p', '0p', '1p'],
    ['1p', '0p', '1p', '1p', '0p'],
    ['1p', '1p', '0p', '1p', '0p'],
    ['1p', '1p', '1p', '1p', '1p'],
  ],
});

export const truthTablesEqual = (left: TruthTable, right: TruthTable) => {
  if (left.inputColumns.join() !== right.inputColumns.join()) return false;
  if (left.outputColumns.join() !== right.outputColumns.join()) return false;
  if (left.rows.length !== right.rows.length) return false;
  return left.rows.every((row, index) => {
    const other = right.rows[index];
    return row.length === other.length && row.every((cell, cellIndex) => cell === other[cellIndex]);
  });
};

// Validation is intentionally structural; source-aware checks only compare declared PARAMS/RETURNVALS columns.
export const validateTruthTable = (table: TruthTable, source?: string): string[] => {
  const errors: string[] = [];
  const expected = source ? inferTruthTableDimensions(source) : null;

  if (table.outputColumns.length === 0) errors.push('Truth table requires at least one output column.');

  const maxRows = expected?.rowCount ?? (
    table.inputColumns.length > 0
      ? 2 ** table.inputColumns.length
      : (table.outputColumns.length > 0 ? 1 : 0)
  );
  if (table.rows.length === 0) {
    errors.push('Truth table requires at least one row.');
  } else if (table.rows.length > maxRows) {
    errors.push(`Truth table has ${table.rows.length} row(s); expected at most ${maxRows}.`);
  }

  table.rows.forEach((row, rowIndex) => {
    const expectedWidth = table.inputColumns.length + table.outputColumns.length;
    if (row.length !== expectedWidth) {
      errors.push(`Row ${rowIndex} has ${row.length} cell(s); expected ${expectedWidth}.`);
      return;
    }
    row.forEach((cell, cellIndex) => {
      if (!isTruthCellValue(cell)) {
        errors.push(`Row ${rowIndex}, column ${cellIndex} has invalid value '${cell}'. Use 0p, 1p, or sp.`);
      }
    });
  });

  if (source) {
    const params = getProtocolParameterEntries(source).filter((param) => param.type === 'state').map((param) => param.name);
    const outputs = getReturnValTokens(source);
    if (params.join() !== table.inputColumns.join()) {
      errors.push(`Input columns [${table.inputColumns.join(', ')}] do not match protocol PARAMS [${params.join(', ')}].`);
    }
    if (outputs.join() !== table.outputColumns.join()) {
      errors.push(`Output columns [${table.outputColumns.join(', ')}] do not match RETURNVALS [${outputs.join(', ')}].`);
    }
  }

  const seenInputRows = new Map<string, number>();
  table.rows.forEach((row, rowIndex) => {
    const inputKey = row.slice(0, table.inputColumns.length).join(',');
    const previousIndex = seenInputRows.get(inputKey);
    if (previousIndex !== undefined) {
      errors.push(`Row ${rowIndex} duplicates the input pattern from row ${previousIndex}.`);
      return;
    }
    seenInputRows.set(inputKey, rowIndex);
  });

  return errors;
};

export const simulateTruthTableOutputs = (
  source: string,
  librarySources: Record<string, string> = {},
  inputRows?: TruthCellValue[][],
): TruthTable => {
  const compiled = compileQpuProtocol(source, librarySources);
  const inputColumns = compiled.processParams.map((param) => param.name);
  const outputColumns = compiled.returnValues.map((value) => value.name);
  const rows = (inputRows ?? Array.from({ length: 2 ** inputColumns.length }, (_, index) => indexToInputRow(index, inputColumns.length)))
    .map((inputs) => {
      const startStates = Array.from({ length: compiled.qubitCount }, () => '0p' as ParticleStartState);
      inputs.forEach((value, index) => {
        setToken(compiled.tokenMap, startStates, inputColumns[index], value);
      });
      const executed = runCircuit(
        compiled.qubitCount,
        compiled.gates,
        startStates,
        compiled.processParams.map((param) => param.qubitIndex),
      );
      const measured = measureAll(executed.state, compiled.qubitCount, executed.measurements);
      const outputs = outputColumns.map((name) => readMeasuredBit(compiled.tokenMap, measured.measurements, name));
      return [...inputs, ...outputs];
    });

  return { inputColumns, outputColumns, rows };
};

// Inference preserves the selected table's input rows when present, otherwise the simulator enumerates all inputs.
export const fillTruthTableFromCircuit = (
  source: string,
  table: TruthTable,
  librarySources: Record<string, string> = {},
): TruthTable => {
  const simulated = simulateTruthTableOutputs(
    source,
    librarySources,
    table.rows.map((row) => row.slice(0, table.inputColumns.length)),
  );
  return {
    inputColumns: table.inputColumns,
    outputColumns: table.outputColumns,
    rows: simulated.rows,
  };
};

// Test execution maps each row onto compiled input qubits, runs the circuit, and compares only declared outputs.
export const testCircuitAgainstTruthTable = (
  source: string,
  table: TruthTable,
  librarySources: Record<string, string> = {},
): TruthTableTestResult => {
  const validationErrors = validateTruthTable(table, source);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(' '));
  }

  const compiled = compileQpuProtocol(source, librarySources);
  const dimensions = describeTruthTableDimensions(source, table);
  const failedRows: TruthTableRowResult[] = [];
  let passedRows = 0;

  table.rows.forEach((row, rowIndex) => {
    const inputs = row.slice(0, table.inputColumns.length) as TruthCellValue[];
    const expectedOutputs = row.slice(table.inputColumns.length) as TruthCellValue[];
    const startStates = Array.from({ length: compiled.qubitCount }, () => '0p' as ParticleStartState);
    inputs.forEach((value, index) => {
      setToken(compiled.tokenMap, startStates, table.inputColumns[index], value);
    });

    const executed = runCircuit(
      compiled.qubitCount,
      compiled.gates,
      startStates,
      compiled.processParams.map((param) => param.qubitIndex),
    );
    const measured = measureAll(executed.state, compiled.qubitCount, executed.measurements);
    const actualOutputs = table.outputColumns.map((name) => readMeasuredBit(compiled.tokenMap, measured.measurements, name));
    const passed = expectedOutputs.every((expected, outputIndex) => {
      if (expected === 'sp') return true;
      return expected === actualOutputs[outputIndex];
    });

    if (passed) {
      passedRows += 1;
    } else {
      failedRows.push({ rowIndex, inputs, expectedOutputs, actualOutputs, passed });
    }
  });

  return {
    passed: failedRows.length === 0,
    totalRows: table.rows.length,
    passedRows,
    failedRows,
    dimensions,
  };
};

export const parseTruthTableJson = (raw: string): TruthTable => {
  const parsed = JSON.parse(raw) as Partial<TruthTable>;
  if (!parsed.inputColumns || !parsed.outputColumns || !parsed.rows) {
    throw new Error('Truth table JSON must include inputColumns, outputColumns, and rows.');
  }
  return {
    inputColumns: parsed.inputColumns,
    outputColumns: parsed.outputColumns,
    rows: parsed.rows as TruthCellValue[][],
  };
};

export const serializeTruthTableJson = (table: TruthTable) => JSON.stringify(table, null, 2);

export const extractProcessName = (source: string) => parseProtocol(source).name;
