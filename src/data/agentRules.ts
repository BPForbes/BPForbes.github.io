/**
 * Shared policy text for the correction assistant.
 *
 * Keeping these rules in data lets prompts, tests, and UI copy reference the
 * same protected-asset policy without hard-coding it in multiple workflows.
 */
import agentsMd from '../../AGENTS.md?raw';

const PROTECTED_QPUIO_LINE = /never edit bundled .*\.qpuio/i;

export const repositoryAgentRules = agentsMd.trim();

export const protectedQpuioAgentRule = () => {
  const matched = agentsMd
    .split('\n')
    .find((line) => PROTECTED_QPUIO_LINE.test(line) || /site-provided .*\.qpuio/i.test(line));
  return matched?.replace(/^[-*]\s*/, '').trim()
    ?? 'Never edit bundled or site-provided .qpuio truth-table files in pull requests.';
};

export const buildAgentRulesPrompt = () => `
Repository agent rules (AGENTS.md):
${repositoryAgentRules}

When interpreting correction requests:
- Do not propose edits to protected bundled truth tables (${protectedQpuioAgentRule()}).
- Prefer catalog-safe actions: open processes, infer tables for user circuits, probe outputs, test, and gate-level protocol fixes.
- If the user asks to change a protected adder or phase-demo truth table, explain that it is site metadata and suggest working on a user-uploaded process instead.
`.trim();
