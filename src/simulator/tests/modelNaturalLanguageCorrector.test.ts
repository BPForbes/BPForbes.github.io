import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseNaturalLanguageWithModel, sanitizeIntent } from '../llm/modelNaturalLanguageCorrector';
// Regression coverage for modelNaturalLanguageCorrector behavior.

const context = {
  source: 'PARAMS: A:state B:state Cin:state',
  truthTable: null,
  inputColumns: ['A', 'B', 'Cin'],
  outputColumns: ['Cout', 'Sum'],
};

describe('sanitizeIntent', () => {
  it('accepts a valid model JSON payload', () => {
    const intent = sanitizeIntent({
      reply: 'Adding carry logic.',
      runTest: true,
      autonomous: true,
      guidance: {
        preferredGates: ['CCNOT', 'INVALID'],
        gates: [{ gate: 'CCNOT', inputs: ['A', 'B'], output: 'Cout' }],
      },
    });

    expect(intent).toEqual({
      reply: 'Adding carry logic.',
      loadFullAdderTable: false,
      inferTable: false,
      probeOutputs: false,
      runTest: true,
      autonomous: true,
      guidance: {
        preferredGates: ['CCNOT'],
        gates: [{ gate: 'CCNOT', inputs: ['A', 'B'], output: 'Cout' }],
      },
    });
  });

  it('rejects invalid payloads', () => {
    expect(sanitizeIntent(null)).toBeNull();
    expect(sanitizeIntent('text')).toBeNull();
    expect(sanitizeIntent('false')).toBeNull();
    expect(sanitizeIntent('0')).toBeNull();
  });

  it('does not coerce string flags to true', () => {
    const intent = sanitizeIntent({
      reply: 'x',
      runTest: 'false',
      autonomous: '0',
    });
    expect(intent?.runTest).toBe(false);
    expect(intent?.autonomous).toBe(false);
  });
});

// Test group: parseNaturalLanguageWithModel.
describe('parseNaturalLanguageWithModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

// Case: returns null when Ollama is unavailable.
  it('returns null when Ollama is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(parseNaturalLanguageWithModel('fix automatically', context)).resolves.toBeNull();
  });

// Case: parses a successful Ollama response.
  it('parses a successful Ollama response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          reply: 'Running autonomous correction.',
          runTest: true,
          autonomous: true,
        }),
      }),
    }));

    const intent = await parseNaturalLanguageWithModel('repair the circuit on its own', context);
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
// Keeps modelNaturalLanguageCorrector.test wiring explicit for maintainers.
});
