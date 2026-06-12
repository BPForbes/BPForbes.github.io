import { describe, expect, it } from 'vitest';
import {
// Regression coverage for clarification behavior.
  formatClarificationPrompt,
  resolveClarificationResponse,
} from '../clarification';

describe('clarification helpers', () => {
  const pending = {
    prompt: 'Several catalog processes match "adder".',
    options: [
      { label: 'SingleBitFullAdder (single-bit-full-adder.qpucir)', command: 'open SingleBitFullAdder' },
      { label: 'TwoBitFullAdder (two-bit-full-adder.qpucir)', command: 'open TwoBitFullAdder' },
    ],
  };

  it('formats numbered clarification prompts', () => {
    const text = formatClarificationPrompt(pending.prompt, pending.options);
    expect(text).toContain('Do you mean?');
    expect(text).toContain('1. SingleBitFullAdder');
    expect(text).toContain('2. TwoBitFullAdder');
  });

  it('resolves numeric replies', () => {
    expect(resolveClarificationResponse('2', pending)?.command).toBe('open TwoBitFullAdder');
    expect(resolveClarificationResponse('option 1', pending)?.command).toBe('open SingleBitFullAdder');
  });

// Case: resolves label replies.
  it('resolves label replies', () => {
    expect(resolveClarificationResponse('TwoBitFullAdder', pending)?.command).toBe('open TwoBitFullAdder');
  });
});
