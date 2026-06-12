import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearBrowserModel,
  parseNaturalLanguageWithWebLlm,
  preloadBrowserModel,
  resetWebLlmEngineForTests,
} from '../llm/webLlmNaturalLanguageCorrector';
import { getCachedBrowserModelId } from '../llm/config';
import { hasWebGpu } from '../webGpu';

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
  deleteModelInCache: vi.fn(async () => undefined),
}));

describe('parseNaturalLanguageWithWebLlm', () => {
  afterEach(() => {
    resetWebLlmEngineForTests();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns null when WebGPU is unavailable', async () => {
    vi.stubGlobal('navigator', {});
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
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('clears the in-memory engine, session marker, and browser model cache', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    vi.stubGlobal('sessionStorage', {
      storage: {} as Record<string, string>,
      setItem(key: string, value: string) { this.storage[key] = value; },
      getItem(key: string) { return this.storage[key] ?? null; },
      removeItem(key: string) { delete this.storage[key]; },
    });

    const { CreateMLCEngine, deleteModelInCache } = await import('@mlc-ai/web-llm');
    vi.mocked(CreateMLCEngine).mockResolvedValue({
      chat: { completions: { create: vi.fn() } },
    } as never);

    await preloadBrowserModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');
    expect(getCachedBrowserModelId()).toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC');

    await clearBrowserModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');
    expect(deleteModelInCache).toHaveBeenCalledWith('Llama-3.2-1B-Instruct-q4f16_1-MLC');
    expect(getCachedBrowserModelId()).toBeNull();
  });

  it('reuses the cached engine on preload and subsequent calls', async () => {
    vi.stubGlobal('navigator', { gpu: {} });

    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
    const create = vi.mocked(CreateMLCEngine);
    create.mockResolvedValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify({ reply: 'ok' }) } }],
          }),
        },
      },
    } as never);

    await preloadBrowserModel();
    await parseNaturalLanguageWithWebLlm('hello', context);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('hasWebGpu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects navigator.gpu', () => {
    vi.stubGlobal('navigator', { gpu: {} });
    expect(hasWebGpu()).toBe(true);
  });
});
