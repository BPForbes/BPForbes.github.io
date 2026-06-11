import { buildAgentRulesPrompt } from '../data/agentRules';
import { formatCatalogForPrompt, formatTestFailuresForPrompt } from '../data/processCatalog';
import { isProtectedQpuioProcess } from '../data/protectedQpuio';
import { extractMainProcessName } from './qpuFormat';
import type { NlCorrectionContext } from './nlIntentTypes';

export const buildNlContextSections = (context: NlCorrectionContext) => {
  const activeName = context.activeProcessName ?? extractMainProcessName(context.source) ?? 'UntitledCircuit';
  const catalog = context.processCatalog?.length
    ? formatCatalogForPrompt(context.processCatalog, { compact: true })
    : formatCatalogForPrompt(undefined, { compact: true });
  const failures = formatTestFailuresForPrompt(context.lastTestResult ?? null);
  const libraryNames = context.libraryProcessNames?.join(', ') || '(catalog processes available for RUNCHILD)';

  const protectionNote = isProtectedQpuioProcess(activeName)
    ? `Active process truth table: PROTECTED site metadata (edits are reverted).`
    : 'Active process truth table: editable.';

  return `
${buildAgentRulesPrompt()}

Active process: ${activeName}
${protectionNote}
Current protocol registers:
- inputs: ${context.inputColumns.join(', ') || '(none)'}
- outputs: ${context.outputColumns.join(', ') || '(none)'}

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
