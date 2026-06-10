import { getProtocolParameterEntries } from '../simulator/qpuFormat';
import { getReturnValTokens } from '../simulator/qpuAst';
import type { TruthCellValue, TruthTable } from '../simulator/truthTable';
import { isTruthCellValue, parseTruthTableJson } from '../simulator/truthTable';

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

const MAIN_PROCESS_PATTERN = /^MAIN-PROCES(?:S)?:\s*(\S+)/i;

const INPUTS_PATTERN = /^INPUTS:\s*(.+)$/i;
const OUTPUTS_PATTERN = /^OUTPUTS:\s*(.+)$/i;

const splitDataLine = (line: string): string[] => {
  if (line.includes(',')) {
    return line.split(',').map((cell) => cell.trim());
  }
  return line.trim().split(/\s+/).filter(Boolean);
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
  if (options.declaredInputs?.length && options.declaredOutputs?.length) {
    return { inputColumns: options.declaredInputs, outputColumns: options.declaredOutputs };
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
    throw new Error('QPUIO file must include a MAIN-PROCES(S): <ProcessName> header.');
  }
  if (headerIndex < 0) {
    throw new Error('QPUIO file must include a column header row starting with #.');
  }

  const columnNames = splitColumnNames(lines[headerIndex]);
  if (columnNames.length < 2) {
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

const parseJsonQpuio = (parsed: Partial<QpuioPayload>): ParsedQpuio => {
  if (parsed.format !== 'qpuio' || parsed.version !== 1) {
    throw new Error('JSON QPUIO envelope must set format to "qpuio" and version to 1.');
  }
  if (!parsed.processName?.trim()) {
    throw new Error('JSON QPUIO envelope must include processName.');
  }
  const truthTable = parseTruthTableJson(JSON.stringify({
    inputColumns: parsed.inputColumns,
    outputColumns: parsed.outputColumns,
    rows: parsed.rows,
  }));
  return { processName: parsed.processName.trim(), truthTable };
};

export const parseQpuioPayload = (contents: string, protocolSource?: string): ParsedQpuio => {
  try {
    const parsed = JSON.parse(contents) as Partial<QpuioPayload>;
    if (parsed.format === 'qpuio') {
      return parseJsonQpuio(parsed);
    }
  } catch {
    // Plain-text QPUIO uploads are the primary interchange format.
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
  const columns = ['#', ...truthTable.inputColumns, ...truthTable.outputColumns];
  const header = style === 'csv'
    ? columns.join(',')
    : columns.join('  ');

  const dataRows = truthTable.rows.map((row, index) => {
    const cells = [String(index), ...row];
    return style === 'csv' ? cells.join(',') : cells.join('  ');
  });

  return [
    `MAIN-PROCES: ${processName}`,
    header,
    ...dataRows,
    '',
  ].join('\n');
};

export const qpuioFileNameForProcess = (processName: string) => `${processName}.qpuio`;

export const companionQpuioFileName = (qpucirFileName: string) => (
  qpucirFileName.replace(/\.qpucir$/i, '.qpuio')
);

export const downloadQpuioContents = (fileName: string, contents: string) => {
  const blob = new Blob([contents], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
