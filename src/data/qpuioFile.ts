/**
 * Parser and serializer for `.qpuio` truth-table metadata.
 *
 * QPU truth tables accept both canonical whitespace-delimited rows and CSV-like
 * user input; this module owns that leniency while returning a strict structure
 * for validation and simulation checks.
 */
import { getProtocolParameterEntries } from '../simulator/qpuFormat';
import { getReturnValTokens } from '../simulator/qpuAst';
import type { TruthCellValue, TruthTable } from '../simulator/truthTable';
import { isTruthCellValue, parseTruthTableJson } from '../simulator/truthTable';
export { companionQpuioFileName, qpuioTxtFileNameForProcess } from './qpuFileNames';

export type QpuioPayload = {
  format: 'qpuio';
  version: 1;
  processName: string;
  inputColumns: string[];
  outputColumns: string[];
  rows: TruthCellValue[][];
};

export type ParsedQpuio = {
  processName: string;
  truthTable: TruthTable;
};

const MAIN_PROCESS_PATTERN = /^MAIN-PROCESS:\s*(\S+)/i;

const INPUTS_PATTERN = /^INPUTS:\s*(.*)$/i;
const OUTPUTS_PATTERN = /^OUTPUTS:\s*(.+)$/i;

const stripInlineComment = (line: string) => line.replace(/\s+#.*$/, '').trim();

const splitDataLine = (line: string): string[] => {
  const data = stripInlineComment(line);
  if (data.includes(',')) {
    return data.split(',').map((cell) => cell.trim());
  }
  return data.split(/\s+/).filter(Boolean);
};

const splitColumnNames = (line: string): string[] => {
  const cells = splitDataLine(line);
  if (cells[0] === '#') return cells.slice(1);
  return cells;
};

const resolveColumnGroups = (
  columnNames: string[],
  options: { protocolSource?: string; declaredInputs?: string[]; declaredOutputs?: string[] },
): { inputColumns: string[]; outputColumns: string[] } => {
  if (options.declaredOutputs?.length !== undefined && options.declaredOutputs.length > 0) {
    const inputColumns = options.declaredInputs ?? [];
    const outputColumns = options.declaredOutputs;
    if (inputColumns.length + outputColumns.length === columnNames.length) {
      return { inputColumns, outputColumns };
    }
  }

  if (options.protocolSource) {
    const inputColumns = getProtocolParameterEntries(options.protocolSource)
      .filter((param) => param.type === 'state')
      .map((param) => param.name);
    const outputColumns = getReturnValTokens(options.protocolSource).map((token) => token.split(':')[0]);
    if (inputColumns.length + outputColumns.length === columnNames.length) {
      return { inputColumns, outputColumns };
    }
  }

  throw new Error(
    'QPUIO column split is ambiguous. Pair with a matching .qpucir protocol, or add INPUTS:/OUTPUTS: header lines.',
  );
};

const parseTextQpuio = (contents: string, protocolSource?: string): ParsedQpuio => {
  const lines = contents
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));

  let processName = '';
  let headerIndex = -1;
  let declaredInputs: string[] | undefined;
  let declaredOutputs: string[] | undefined;

  lines.forEach((line, index) => {
    const processMatch = line.match(MAIN_PROCESS_PATTERN);
    if (processMatch) {
      processName = processMatch[1];
      return;
    }
    const inputsMatch = line.match(INPUTS_PATTERN);
    if (inputsMatch) {
      declaredInputs = splitDataLine(inputsMatch[1]);
      return;
    }
    const outputsMatch = line.match(OUTPUTS_PATTERN);
    if (outputsMatch) {
      declaredOutputs = splitDataLine(outputsMatch[1]);
      return;
    }
    if (headerIndex < 0 && /^#(?:\s|,)/.test(line)) {
      headerIndex = index;
    }
  });

  if (!processName) {
    throw new Error('QPUIO file must include a MAIN-PROCESS: <ProcessName> header.');
  }
  if (headerIndex < 0) {
    throw new Error('QPUIO file must include a column header row starting with #.');
  }

  const columnNames = splitColumnNames(lines[headerIndex]);
  if (columnNames.length < 1) {
    throw new Error('QPUIO truth table requires at least one output column.');
  }
  if (columnNames.length < 2 && !declaredOutputs?.length) {
    throw new Error('QPUIO truth table requires at least one input and one output column.');
  }

  const dataLines = lines.slice(headerIndex + 1);
  if (dataLines.length === 0) {
    throw new Error('QPUIO file has no truth-table data rows.');
  }

  const rows: TruthCellValue[][] = [];
  dataLines.forEach((line, lineOffset) => {
    const cells = splitDataLine(line);
    if (cells.length !== columnNames.length + 1) {
      throw new Error(
        `Row ${lineOffset} has ${cells.length - 1} value(s); expected ${columnNames.length}.`,
      );
    }
    const rowIndex = Number(cells[0]);
    if (!Number.isInteger(rowIndex) || rowIndex !== lineOffset) {
      throw new Error(`Row index ${cells[0]} is out of sequence; expected ${lineOffset}.`);
    }
    const values = cells.slice(1);
    values.forEach((value, columnIndex) => {
      if (!isTruthCellValue(value)) {
        throw new Error(
          `Row ${rowIndex}, column '${columnNames[columnIndex]}' has invalid value '${value}'. Use 0p, 1p, or sp.`,
        );
      }
    });
    rows.push(values as TruthCellValue[]);
  });

  const { inputColumns, outputColumns } = resolveColumnGroups(columnNames, {
    protocolSource,
    declaredInputs,
    declaredOutputs,
  });

  if ([...inputColumns, ...outputColumns].join() !== columnNames.join()) {
    throw new Error(
      `QPUIO columns [${columnNames.join(', ')}] do not match resolved inputs [${inputColumns.join(', ')}] and outputs [${outputColumns.join(', ')}].`,
    );
  }

  return {
    processName,
    truthTable: { inputColumns, outputColumns, rows },
  };
};

const parseColumnNames = (columns: unknown, label: string): string[] => {
  if (!Array.isArray(columns)) {
    throw new Error(`JSON QPUIO envelope must include ${label} as an array.`);
  }
  return columns.map((column, index) => {
    if (typeof column !== 'string') {
      throw new Error(`${label}[${index}] must be a string.`);
    }
    const name = column.trim();
    if (!name) {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }
    return name;
  });
};

const parseJsonRows = (
  rows: unknown,
  inputColumns: string[],
  outputColumns: string[],
): TruthCellValue[][] => {
  if (!Array.isArray(rows)) {
    throw new Error('JSON QPUIO envelope must include rows as an array.');
  }
  const expectedWidth = inputColumns.length + outputColumns.length;
  return rows.map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new Error(`Row ${rowIndex} must be an array.`);
    }
    if (row.length !== expectedWidth) {
      throw new Error(`Row ${rowIndex} has ${row.length} cell(s); expected ${expectedWidth}.`);
    }
    return row.map((cell, columnIndex) => {
      const value = String(cell).trim();
      if (!isTruthCellValue(value)) {
        const column = columnIndex < inputColumns.length
          ? inputColumns[columnIndex]
          : outputColumns[columnIndex - inputColumns.length];
        throw new Error(`Row ${rowIndex}, column '${column}' has invalid value '${value}'. Use 0p, 1p, or sp.`);
      }
      return value;
    });
  });
};

const parseJsonQpuio = (parsed: Partial<QpuioPayload>): ParsedQpuio => {
  if (parsed.format !== 'qpuio' || parsed.version !== 1) {
    throw new Error('JSON QPUIO envelope must set format to "qpuio" and version to 1.');
  }
  if (!parsed.processName?.trim()) {
    throw new Error('JSON QPUIO envelope must include processName.');
  }
  const inputColumns = parsed.inputColumns === undefined
    ? []
    : parseColumnNames(parsed.inputColumns, 'inputColumns');
  const outputColumns = parseColumnNames(parsed.outputColumns, 'outputColumns');
  if (outputColumns.length === 0) {
    throw new Error('Truth table requires at least one output column.');
  }
  const rows = parseJsonRows(parsed.rows, inputColumns, outputColumns);
  const truthTable = parseTruthTableJson(JSON.stringify({ inputColumns, outputColumns, rows }));
  return { processName: parsed.processName.trim(), truthTable };
};

export const parseQpuioPayload = (contents: string, protocolSource?: string): ParsedQpuio => {
  const trimmed = contents.trim();
  if (trimmed.startsWith('{')) {
    let parsed: Partial<QpuioPayload>;
    try {
      parsed = JSON.parse(contents) as Partial<QpuioPayload>;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    if (parsed.format === 'qpuio') {
      return parseJsonQpuio(parsed);
    }
  }
  return parseTextQpuio(contents, protocolSource);
};

export const createQpuioPayload = (
  processName: string,
  truthTable: TruthTable,
): QpuioPayload => ({
  format: 'qpuio',
  version: 1,
  processName,
  inputColumns: truthTable.inputColumns,
  outputColumns: truthTable.outputColumns,
  rows: truthTable.rows,
});

export const serializeQpuioText = (
  processName: string,
  truthTable: TruthTable,
  style: 'space' | 'csv' = 'space',
): string => {
  const sep = style === 'csv' ? ',' : '  ';
  const columns = ['#', ...truthTable.inputColumns, ...truthTable.outputColumns];
  const header = columns.join(sep);

  const dataRows = truthTable.rows.map((row, index) => {
    const cells = [String(index), ...row];
    return cells.join(sep);
  });

  const headerLines: string[] = [`MAIN-PROCESS: ${processName}`];
  if (truthTable.inputColumns.length > 0) {
    headerLines.push(`INPUTS: ${truthTable.inputColumns.join(sep)}`);
  }
  headerLines.push(`OUTPUTS: ${truthTable.outputColumns.join(sep)}`);

  return [...headerLines, header, ...dataRows, ''].join('\n');
};

export const qpuioFileNameForProcess = (processName: string) => `${processName}.qpuio`;

export const downloadQpuioContents = (fileName: string, contents: string) => {
  const blob = new Blob([contents], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};
