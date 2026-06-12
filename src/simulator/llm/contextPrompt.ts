import { buildAgentRulesPrompt } from '../../data/agentRules';
import { formatCatalogForPrompt, formatTestFailuresForPrompt } from '../../data/processCatalog';
import { isProtectedQpuioProcess } from '../../data/protectedQpuio';
import { extractMainProcessName } from '../qpuFormat';
import type { NlCorrectionContext } from './intentTypes';
import { describeTruthTableDimensions, formatTruthTableRowSummary } from '../truthTable';

// Prompt sections mirror the correction UI state: active protocol, protections, catalog, and latest test failures.
export const buildNlContextSections = (context: NlCorrectionContext) => {
  const activeName = context.activeProcessName ?? extractMainProcessName(context.source) ?? 'UntitledCircuit';
  // Catalog and test summaries are compacted to keep small browser models within their context window.
  const catalog = context.processCatalog?.length
    ? formatCatalogForPrompt(context.processCatalog, { compact: true })
    : formatCatalogForPrompt(undefined, { compact: true });
  const failures = formatTestFailuresForPrompt(context.lastTestResult ?? null);
  const libraryNames = context.libraryProcessNames?.join(', ') || '(catalog processes available for RUNCHILD)';

  // Protected-table status is repeated in the prompt because model intents may request persistence actions.
  const protectionNote = isProtectedQpuioProcess(activeName)
    ? `Active process truth table: PROTECTED site metadata (edits are reverted).`
    : 'Active process truth table: editable.';
  let tableDimensions = null;
  if (context.truthTable) {
    try {
      tableDimensions = describeTruthTableDimensions(context.source, context.truthTable);
    } catch {
      // Fall back when protocol source cannot be parsed for dimension inference.
    }
  }
  // Partial-table scope is explicit so model-suggested tests/corrections do not assume missing rows were failures.
  const tableScopeNote = tableDimensions
    ? `Truth table scope: ${formatTruthTableRowSummary(tableDimensions)}. Tests, probe, and correction only evaluate listed rows.`
    : 'Truth table scope: not loaded.';

  return `
${buildAgentRulesPrompt()}

Active process: ${activeName}
${protectionNote}
Current protocol registers:
- inputs: ${context.inputColumns.join(', ') || '(none)'}
- outputs: ${context.outputColumns.join(', ') || '(none)'}
${tableScopeNote}

Cataloged processes (builder compiles, uploads, and bundled examples):
${catalog}

Library process names for child resolution:
${libraryNames}

Latest truth-table test result:
${failures}

${context.pendingClarification
  ? `Pending clarification for the user — pick one option or interpret their reply:\n${context.pendingClarification.options.map((option, index) => `  ${index + 1}. ${option.label} (command: ${option.command})`).join('\n')}`
  : 'No pending clarification.'}

Current protocol source preview:
${context.source.trim().split('\n').slice(0, 12).map((line) => `  ${line}`).join('\n') || '  (empty protocol)'}
`.trim();
};
