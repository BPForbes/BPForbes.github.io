import { describe, expect, it, vi } from 'vitest';
import { parseCorrectionIntent } from './correctionIntentParser';

const context = {
  source: 'PARAMS: A:state B:state Cin:state',
  truthTable: null,
  inputColumns: ['A', 'B', 'Cin'],
  outputColumns: ['Cout', 'Sum'],
};

describe('parseCorrectionIntent', () => {
  it('uses the regex parser for known commands without calling the LLM', async () => {
    const intent = await parseCorrectionIntent('test the circuit', context, { useLlm: false });
    expect(intent.runTest).toBe(true);
    expect(intent.autonomous).toBe(false);
  });

  it('skips the LLM when regex already handled the message', async () => {
    const model = await import('./modelNaturalLanguageCorrector');
    const spy = vi.spyOn(model, 'parseNaturalLanguageWithModel');

    const intent = await parseCorrectionIntent('fix the circuit automatically', context, { useLlm: true });
    expect(intent.autonomous).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
