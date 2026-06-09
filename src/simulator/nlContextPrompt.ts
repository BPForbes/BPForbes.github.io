import { formatCatalogForPrompt, formatTestFailuresForPrompt } from '../data/processCatalog';
import { extractMainProcessName } from './qpuFormat';
import type { NlCorrectionContext } from './nlIntentTypes';

export const buildNlContextSections = (context: NlCorrectionContext) => {
  const activeName = context.activeProcessName ?? extractMainProcessName(context.source) ?? 'UntitledCircuit';
  const catalog = context.processCatalog?.length
    ? formatCatalogForPrompt(context.processCatalog, { compact: true })
    : formatCatalogForPrompt(undefined, { compact: true });
  const failures = formatTestFailuresForPrompt(context.lastTestResult ?? null);
  const libraryNames = context.libraryProcessNames?.join(', ') || '(catalog processes available for RUNCHILD)';

  return `
Active process: ${activeName}
Current protocol registers:
- inputs: ${context.inputColumns.join(', ') || '(none)'}
- outputs: ${context.outputColumns.join(', ') || '(none)'}

Cataloged processes (builder compiles, uploads, and bundled examples):
${catalog}

Library process names for child resolution:
${libraryNames}

Latest truth-table test result:
${failures}

Current protocol source preview:
${context.source.trim().split('\n').slice(0, 12).map((line) => `  ${line}`).join('\n') || '  (empty protocol)'}
`.trim();
};
