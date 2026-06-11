import { configuredProcesses } from './protocolExamples';
import {
  enforceProtectedTruthTable,
  getProtectedQpuioFileName,
  getProtectedTruthTable,
  isProtectedQpuioProcess,
} from './protectedQpuio';
import { qpuioFileNameForProcess } from './qpuioFile';
import { extractMainProcessName, qpucirFileNameForSource } from '../simulator/qpuFormat';
import { describeTruthTableDimensions, formatTruthTableRowSummary, inferTruthTableDimensions } from '../simulator/truthTable';
import { getProtocolParameterEntries } from '../simulator/qpuFormat';
import { getReturnValTokens } from '../simulator/qpuAst';
import type { TruthTable, TruthTableTestResult } from '../simulator/truthTable';
import type { ProcessCatalogSummary } from '../simulator/nlIntentTypes';

export type ProcessCatalogOrigin = 'bundled' | 'compiled' | 'uploaded' | 'corrected';

export type ProcessCatalogEntry = {
  id: string;
  name: string;
  source: string;
  origin: ProcessCatalogOrigin;
  fileName?: string;
  truthTable?: TruthTable;
  truthTableFileName?: string;
  truthTableProtected?: boolean;
  description?: string;
  updatedAt: string;
};

const STORAGE_KEY = 'qpu-process-catalog-v1';

const catalog = new Map<string, ProcessCatalogEntry>();

let catalogVersion = 0;
let summariesCache: ProcessCatalogSummary[] | null = null;
let libraryCache: Record<string, string> | null = null;

const invalidateCatalogCache = () => {
  catalogVersion += 1;
  summariesCache = null;
  libraryCache = null;
};

export const getCatalogVersion = () => catalogVersion;

const entryIdForName = (name: string) => name.trim().toLowerCase();

const summarizeSource = (source: string, maxLines = 6) => source
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(0, maxLines)
  .join('\n');

const readColumns = (source: string) => {
  try {
    const inputs = getProtocolParameterEntries(source)
      .filter((param) => param.type === 'state')
      .map((param) => param.name);
    const outputs = getReturnValTokens(source).map((token) => token.split(':')[0]);
    return { inputs, outputs };
  } catch {
    return { inputs: [], outputs: [] };
  }
};

const protocolSignatureMatches = (leftSource: string, rightSource: string) => {
  const left = readColumns(leftSource);
  const right = readColumns(rightSource);
  return left.inputs.join() === right.inputs.join() && left.outputs.join() === right.outputs.join();
};

const canonicalProtectedTruthTableFileName = (processName: string, fallback?: string) => (
  isProtectedQpuioProcess(processName)
    ? getProtectedQpuioFileName(processName) ?? fallback
    : fallback
);

const persistCatalog = () => {
  if (typeof sessionStorage === 'undefined') return;
  const entries = Array.from(catalog.values()).filter((entry) => entry.origin !== 'bundled');
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore persistence failures; keep in-memory catalog functional.
  }
};

const restoreCatalog = () => {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as ProcessCatalogEntry[];
    entries.forEach((entry) => {
      if (entry?.name && entry?.source) {
        const enforced = enforceProtectedTruthTable(entry.name, entry.truthTable);
        catalog.set(entryIdForName(entry.name), {
          ...entry,
          truthTable: enforced?.truthTable ?? entry.truthTable,
          truthTableFileName: canonicalProtectedTruthTableFileName(entry.name, entry.truthTableFileName),
          truthTableProtected: isProtectedQpuioProcess(entry.name),
        });
      }
    });
  } catch {
    // Ignore corrupt session data.
  }
};

const catalogAliases = (entry: ProcessCatalogEntry): string[] => {
  const aliases = new Set<string>([entry.name, entry.id]);
  if (entry.fileName) {
    aliases.add(entry.fileName);
    aliases.add(entry.fileName.replace(/\.qpucir$/i, ''));
  }
  return Array.from(aliases);
};

const seedBundledProcesses = () => {
  configuredProcesses.forEach((process) => {
    const name = process.name;
    const truthTable = process.truthTable;
    catalog.set(entryIdForName(name), {
      id: entryIdForName(name),
      name,
      source: process.source,
      fileName: process.fileName,
      truthTable,
      truthTableFileName: process.truthTableFileName,
      truthTableProtected: isProtectedQpuioProcess(name),
      origin: 'bundled',
      description: `Bundled example (${process.fileName})`,
      updatedAt: process.exportedAt ?? new Date(0).toISOString(),
    });
  });
};

seedBundledProcesses();
restoreCatalog();

export const registerCatalogProcess = (input: {
  name: string;
  source: string;
  origin: ProcessCatalogOrigin;
  fileName?: string;
  truthTable?: TruthTable;
  truthTableFileName?: string;
  description?: string;
}) => {
  const name = input.name.trim() || extractMainProcessName(input.source) || 'UntitledCircuit';
  const existing = catalog.get(entryIdForName(name));
  const signatureMatches = existing ? protocolSignatureMatches(existing.source, input.source) : false;
  const inheritedTable = signatureMatches ? existing?.truthTable : undefined;
  const candidateTable = input.truthTable ?? inheritedTable ?? existing?.truthTable;
  const protectedTable = enforceProtectedTruthTable(name, candidateTable);
  const entry: ProcessCatalogEntry = {
    id: entryIdForName(name),
    name,
    source: input.source,
    fileName: input.fileName?.trim() || existing?.fileName || undefined,
    truthTable: protectedTable?.truthTable ?? candidateTable,
    truthTableFileName: canonicalProtectedTruthTableFileName(
      name,
      input.truthTableFileName?.trim() || existing?.truthTableFileName || undefined,
    ),
    truthTableProtected: isProtectedQpuioProcess(name),
    origin: input.origin,
    description: input.description ?? existing?.description,
    updatedAt: new Date().toISOString(),
  };
  catalog.set(entry.id, entry);
  invalidateCatalogCache();
  persistCatalog();
  return entry;
};

export const registerCatalogTruthTable = (input: {
  processName: string;
  truthTable: TruthTable;
  truthTableFileName?: string;
  protocolSource?: string;
}): { entry: ProcessCatalogEntry; reverted: boolean } => {
  const name = input.processName.trim();
  if (!name) throw new Error('Process name is required to register a truth table.');

  const existing = getCatalogEntry(name);
  const protectedTable = enforceProtectedTruthTable(name, input.truthTable);
  const entry: ProcessCatalogEntry = existing ?? {
    id: entryIdForName(name),
    name,
    source: input.protocolSource ?? `MAIN-PROCESS ${name}\nRETURNVALS Y:0`,
    origin: 'uploaded',
    updatedAt: new Date().toISOString(),
  };

  const merged: ProcessCatalogEntry = {
    ...entry,
    truthTable: protectedTable?.truthTable ?? input.truthTable,
    truthTableFileName: canonicalProtectedTruthTableFileName(
      name,
      input.truthTableFileName?.trim() || entry.truthTableFileName,
    ),
    truthTableProtected: isProtectedQpuioProcess(name),
    updatedAt: new Date().toISOString(),
  };
  catalog.set(merged.id, merged);
  invalidateCatalogCache();
  persistCatalog();
  return { entry: merged, reverted: protectedTable?.reverted ?? false };
};

export const getCatalogTruthTable = (processName: string): TruthTable | undefined => {
  if (isProtectedQpuioProcess(processName)) {
    return getProtectedTruthTable(processName) ?? getCatalogEntry(processName)?.truthTable;
  }
  return getCatalogEntry(processName)?.truthTable;
};

export const isCatalogTruthTableProtected = (processName: string) => isProtectedQpuioProcess(processName);

export const getCatalogEntries = (): ProcessCatalogEntry[] => (
  Array.from(catalog.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
);

export const getCatalogEntry = (name: string): ProcessCatalogEntry | undefined => (
  catalog.get(entryIdForName(name))
);

/** Resolve a catalog entry by process name, .qpucir filename, or stem. */
export const resolveCatalogEntry = (query: string): ProcessCatalogEntry | undefined => {
  const normalized = query.trim().replace(/^["']|["']$/g, '');
  if (!normalized) return undefined;

  const direct = getCatalogEntry(normalized);
  if (direct) return direct;

  const lower = normalized.toLowerCase();
  const withExt = lower.endsWith('.qpucir') ? lower : `${lower}.qpucir`;
  const withQpuio = lower.endsWith('.qpuio') ? lower : `${lower}.qpuio`;

  return getCatalogEntries().find((entry) => (
    catalogAliases(entry).some((alias) => {
      const aliasLower = alias.toLowerCase();
      return aliasLower === lower
        || aliasLower === withExt
        || aliasLower === withQpuio
        || aliasLower.replace(/\.qpucir$/i, '') === lower.replace(/\.qpucir$/i, '')
        || aliasLower.replace(/\.qpuio$/i, '') === lower.replace(/\.qpuio$/i, '');
    })
    || entry.truthTableFileName?.toLowerCase() === lower
    || entry.truthTableFileName?.toLowerCase() === withQpuio
  ));
};

/** Find catalog entries matching a partial name, filename, or alias. */
export const findCatalogCandidates = (query: string): ProcessCatalogEntry[] => {
  const normalized = query.trim().replace(/^["']|["']$/g, '');
  if (!normalized) return [];

  const exact = resolveCatalogEntry(normalized);
  if (exact) return [exact];

  const lower = normalized.toLowerCase();
  const withExt = lower.endsWith('.qpucir') ? lower : `${lower}.qpucir`;
  const stem = lower.replace(/\.qpucir$/i, '');

  return getCatalogEntries().filter((entry) => (
    catalogAliases(entry).some((alias) => {
      const aliasLower = alias.toLowerCase();
      const aliasStem = aliasLower.replace(/\.qpucir$/i, '');
      return aliasLower.includes(stem)
        || aliasStem.includes(stem)
        || stem.includes(aliasStem)
        || aliasLower === withExt;
    })
    || entry.name.toLowerCase().includes(stem)
    || (entry.description?.toLowerCase().includes(stem) ?? false)
  ));
};

export const getCatalogLibrarySources = (): Record<string, string> => {
  if (libraryCache) return libraryCache;
  libraryCache = Object.fromEntries(getCatalogEntries().map((entry) => [entry.name, entry.source]));
  return libraryCache;
};

export const buildProcessCatalogSummaries = (): ProcessCatalogSummary[] => {
  if (summariesCache) return summariesCache;
  summariesCache = getCatalogEntries().map((entry) => {
    const columns = readColumns(entry.source);
    let dimensions = { rowCount: 0, columnCount: 0, inputCount: 0, outputCount: 0 };
    try {
      dimensions = inferTruthTableDimensions(entry.source);
    } catch {
      // Non-state protocols may not infer cleanly.
    }
    const truthTable = entry.truthTable;
    let tableDimensions = dimensions;
    if (truthTable) {
      try {
        tableDimensions = describeTruthTableDimensions(entry.source, truthTable);
      } catch {
        // Fall back when protocol source cannot be parsed for dimension inference.
      }
    }
    return {
      name: entry.name,
      origin: entry.origin,
      fileName: entry.fileName,
      inputColumns: truthTable?.inputColumns ?? columns.inputs,
      outputColumns: truthTable?.outputColumns ?? columns.outputs,
      rowCount: truthTable?.rows.length ?? dimensions.rowCount,
      combinatorialRowCount: tableDimensions.rowCount,
      isPartialTruthTable: tableDimensions.isPartial,
      hasTruthTable: Boolean(truthTable),
      truthTableProtected: entry.truthTableProtected ?? isProtectedQpuioProcess(entry.name),
      summary: summarizeSource(entry.source),
      description: entry.description,
    };
  });
  return summariesCache;
};

export const formatCatalogForPrompt = (
  entries: ProcessCatalogSummary[] = buildProcessCatalogSummaries(),
  options: { compact?: boolean } = {},
) => {
  if (entries.length === 0) return '(no cataloged processes)';
  return entries.map((entry) => [
    `- ${entry.name} [${entry.origin}]`,
    `  inputs: ${entry.inputColumns.join(', ') || '(none)'}`,
    `  outputs: ${entry.outputColumns.join(', ') || '(none)'}`,
    entry.rowCount
      ? `  truth-table rows: ${entry.isPartialTruthTable
        ? formatTruthTableRowSummary({
          rowCount: entry.combinatorialRowCount ?? entry.rowCount,
          listedRowCount: entry.rowCount,
          isPartial: true,
          columnCount: entry.inputColumns.length + entry.outputColumns.length,
          inputCount: entry.inputColumns.length,
          outputCount: entry.outputColumns.length,
        })
        : entry.rowCount}`
      : null,
    entry.description ? `  note: ${entry.description}` : null,
    !options.compact && entry.summary
      ? `  source preview:\n${entry.summary.split('\n').map((line) => `    ${line}`).join('\n')}`
      : null,
  ].filter(Boolean).join('\n')).join('\n');
};

export const formatTestFailuresForPrompt = (result: TruthTableTestResult | null | undefined) => {
  if (!result) return 'No test has been run yet.';
  const scope = result.dimensions.isPartial
    ? `${result.totalRows} listed row(s) (${result.totalRows} of ${result.dimensions.rowCount} combinatorial rows)`
    : `${result.totalRows} truth-table row(s)`;
  if (result.passed) return `All ${scope} pass.`;
  const lines = result.failedRows.slice(0, 12).map((row) => (
    `Row ${row.rowIndex}: inputs [${row.inputs.join(', ')}] expected [${row.expectedOutputs.join(', ')}] got [${row.actualOutputs.join(', ')}]`
  ));
  const suffix = result.failedRows.length > 12
    ? `\n...and ${result.failedRows.length - 12} more failing row(s).`
    : '';
  return `${result.failedRows.length} of ${result.totalRows} row(s) fail:\n${lines.join('\n')}${suffix}`;
};

export type PersistCatalogArtifactsInput = {
  processName: string;
  source: string;
  truthTable?: TruthTable;
  origin?: ProcessCatalogOrigin;
  description?: string;
  updateQpuio?: boolean;
  updateQpucir?: boolean;
};

export type PersistCatalogArtifactsResult = {
  entry: ProcessCatalogEntry;
  qpuioUpdated: boolean;
  qpucirUpdated: boolean;
  qpuioReverted: boolean;
  skipped: boolean;
  message: string;
};

export const persistCatalogArtifacts = (input: PersistCatalogArtifactsInput): PersistCatalogArtifactsResult => {
  const name = input.processName.trim() || extractMainProcessName(input.source) || 'UntitledCircuit';
  const existing = getCatalogEntry(name);
  const updateQpuio = input.updateQpuio ?? false;
  const updateQpucir = input.updateQpucir ?? false;

  if (existing?.origin === 'bundled') {
    return {
      entry: existing,
      qpuioUpdated: false,
      qpucirUpdated: false,
      qpuioReverted: false,
      skipped: true,
      message: `Skipped catalog persistence for bundled process ${name}.`,
    };
  }

  const nextSource = updateQpucir ? input.source : (existing?.source ?? input.source);
  let nextTable = updateQpuio ? input.truthTable ?? existing?.truthTable : existing?.truthTable;
  let qpuioReverted = false;

  if (updateQpuio && nextTable && isProtectedQpuioProcess(name)) {
    const enforced = enforceProtectedTruthTable(name, nextTable);
    nextTable = enforced?.truthTable ?? nextTable;
    qpuioReverted = enforced?.reverted ?? false;
  }

  const entry = registerCatalogProcess({
    name,
    source: nextSource,
    origin: input.origin ?? existing?.origin ?? 'compiled',
    fileName: updateQpucir
      ? existing?.fileName ?? qpucirFileNameForSource(nextSource, name)
      : existing?.fileName,
    truthTable: updateQpuio ? nextTable : existing?.truthTable,
    truthTableFileName: updateQpuio
      ? existing?.truthTableFileName ?? qpuioFileNameForProcess(name)
      : existing?.truthTableFileName,
    description: input.description ?? existing?.description,
  });

  const updatedParts = [
    updateQpucir && entry.fileName ? entry.fileName : null,
    updateQpuio && entry.truthTableFileName ? entry.truthTableFileName : null,
  ].filter(Boolean);

  const message = qpuioReverted
    ? `Catalog persistence for ${name} kept the protected default truth table.`
    : updatedParts.length > 0
      ? `Saved ${name} catalog metadata (${updatedParts.join(' + ')}).`
      : `No catalog metadata changed for ${name}.`;

  return {
    entry,
    qpuioUpdated: updateQpuio && Boolean(entry.truthTable) && !qpuioReverted,
    qpucirUpdated: updateQpucir,
    qpuioReverted,
    skipped: false,
    message,
  };
};

/** @internal Test helper */
export const resetProcessCatalogForTests = () => {
  catalog.clear();
  invalidateCatalogCache();
  seedBundledProcesses();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEY);
  }
};
