import { describe, expect, it } from 'vitest';
import { buildAgentRulesPrompt, protectedQpuioAgentRule, repositoryAgentRules } from '../agentRules';

describe('agentRules', () => {
  it('loads AGENTS.md content for LLM prompts', () => {
    expect(repositoryAgentRules).toContain('Never edit bundled or site-provided `.qpuio`');
    expect(protectedQpuioAgentRule()).toContain('.qpuio');
    expect(buildAgentRulesPrompt()).toContain('Repository agent rules');
  });
});
