import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasWebGpu,
  parseNaturalLanguageWithWebLlm,
  resetWebLlmEngineForTests,
  sanitizeIntent,
} from './webLlmNaturalLanguageCorrector';

const context = {
  source: 'PARAMS: A:state B:state Cin:state',
  truthTable: null,
  inputColumns: ['A', 'B', 'Cin'],
  outputColumns: ['Cout', 'Sum'],
};

vi.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: vi.fn(async () => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));

describe('sanitizeIntent', () => {
  it('accepts a valid WebLLM JSON payload', () => {
    expect(sanitizeIntent({
      reply: 'Repairing carry logic.',
      runTest: true,
      autonomous: true,
      guidance: {
        preferredGates: ['CCNOT', 'X'],
        gates: [{ gate: 'CNOT', inputs: ['A'], output: 'Sum' }],
      },
    })).toEqual({
      reply: 'Repairing carry logic.',
      loadFullAdderTable: false,
      inferTable: false,
      probeOutputs: false,
      runTest: true,
      autonomous: true,
      guidance: {
        preferredGates: ['CCNOT'],
        gates: [{ gate: 'CNOT', inputs: ['A'], output: 'Sum' }],
      },
    });
  });
});

describe('parseNaturalLanguageWithWebLlm', () => {
  afterEach(() => {
    resetWebLlmEngineForTests();
    vi.clearAllMocks();
  });

  it('returns null when WebGPU is unavailable', async () => {
    vi.stubGlobal('navigator', { gpu: undefined });
    await expect(parseNaturalLanguageWithWebLlm('fix automatically', context)).resolves.toBeNull();
  });

  it('parses a successful WebLLM response when WebGPU is available', async () => {
    vi.stubGlobal('navigator', { gpu: {} });

    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
    const create = vi.mocked(CreateMLCEngine);
    create.mockResolvedValueOnce({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify({
                  reply: 'Running autonomous correction.',
                  runTest: true,
                  autonomous: true,
                }),
              },
            }],
          }),
        },
      },
    } as never);

    const intent = await parseNaturalLanguageWithWebLlm('repair the circuit on its own', context);
    expect(intent).toEqual({
      reply: 'Running autonomous correction.',
      loadFullAdderTable: false,
      inferTable: false,
      probeOutputs: false,
      runTest: true,
      autonomous: true,
      guidance: undefined,
    });
  });
});

describe('hasWebGpu', () => {
  it('detects navigator.gpu', () => {
    vi.stubGlobal('navigator', { gpu: {} });
    expect(hasWebGpu()).toBe(true);
  });
});
