import { configuredProcesses } from './protocolExamples';
import { extractMainProcessName } from '../simulator/qpuFormat';
import { inferTruthTableDimensions } from '../simulator/truthTable';
import { getProtocolParameterEntries } from '../simulator/qpuFormat';
import { getReturnValTokens } from '../simulator/qpuAst';
import type { TruthTableTestResult } from '../simulator/truthTable';
import type { ProcessCatalogSummary } from '../simulator/nlIntentTypes';

export type ProcessCatalogOrigin = 'bundled' | 'compiled' | 'uploaded' | 'corrected';

export type ProcessCatalogEntry = {
  id: string;
  name: string;
  source: string;
  origin: ProcessCatalogOrigin;
  fileName?: string;
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
        catalog.set(entryIdForName(entry.name), entry);
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
    catalog.set(entryIdForName(name), {
      id: entryIdForName(name),
      name,
      source: process.source,
      fileName: process.fileName,
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
  description?: string;
}) => {
  const name = input.name.trim() || extractMainProcessName(input.source) || 'UntitledCircuit';
  const entry: ProcessCatalogEntry = {
    id: entryIdForName(name),
    name,
    source: input.source,
    fileName: input.fileName?.trim() || undefined,
    origin: input.origin,
    description: input.description,
    updatedAt: new Date().toISOString(),
  };
  catalog.set(entry.id, entry);
  invalidateCatalogCache();
  persistCatalog();
  return entry;
};

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

  return getCatalogEntries().find((entry) => (
    catalogAliases(entry).some((alias) => {
      const aliasLower = alias.toLowerCase();
      return aliasLower === lower
        || aliasLower === withExt
        || aliasLower.replace(/\.qpucir$/i, '') === lower.replace(/\.qpucir$/i, '');
    })
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
    return {
      name: entry.name,
      origin: entry.origin,
      fileName: entry.fileName,
      inputColumns: columns.inputs,
      outputColumns: columns.outputs,
      rowCount: dimensions.rowCount,
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
    entry.rowCount ? `  truth-table rows: ${entry.rowCount}` : null,
    entry.description ? `  note: ${entry.description}` : null,
    !options.compact && entry.summary
      ? `  source preview:\n${entry.summary.split('\n').map((line) => `    ${line}`).join('\n')}`
      : null,
  ].filter(Boolean).join('\n')).join('\n');
};

export const formatTestFailuresForPrompt = (result: TruthTableTestResult | null | undefined) => {
  if (!result) return 'No test has been run yet.';
  if (result.passed) return `All ${result.totalRows} truth-table rows pass.`;
  const lines = result.failedRows.slice(0, 12).map((row) => (
    `Row ${row.rowIndex}: inputs [${row.inputs.join(', ')}] expected [${row.expectedOutputs.join(', ')}] got [${row.actualOutputs.join(', ')}]`
  ));
  const suffix = result.failedRows.length > 12
    ? `\n...and ${result.failedRows.length - 12} more failing row(s).`
    : '';
  return `${result.failedRows.length} of ${result.totalRows} row(s) fail:\n${lines.join('\n')}${suffix}`;
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
