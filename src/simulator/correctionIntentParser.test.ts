import { describe, expect, it, vi } from 'vitest';
import { parseCorrectionIntent } from './correctionIntentParser';

const context = {
  source: 'PARAMS: A:state B:state Cin:state',
  truthTable: null,
  inputColumns: ['A', 'B', 'Cin'],
  outputColumns: ['Cout', 'Sum'],
};

describe('parseCorrectionIntent', () => {
  it('uses the regex parser for known commands without loading WebLLM', async () => {
    const intent = await parseCorrectionIntent('test the circuit', context, { useWebLlm: false });
    expect(intent.runTest).toBe(true);
    expect(intent.autonomous).toBe(false);
  });

  it('skips WebLLM when regex already handled the message', async () => {
    const webLlm = await import('./webLlmNaturalLanguageCorrector');
    const spy = vi.spyOn(webLlm, 'parseNaturalLanguageWithWebLlm');

    const intent = await parseCorrectionIntent('fix the circuit automatically', context, { useWebLlm: true });
    expect(intent.autonomous).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
