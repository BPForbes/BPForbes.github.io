import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, stepCircuitGate } from './engine';
import type { CircuitGate } from './types';
import { registerCustomGate } from './gates/customGateEngine';
import { refreshCustomGateRegistry } from './gates/registry';

const gate = (type: string, step: number, targets: number[], controls: number[] = []): CircuitGate => ({
  id: `${type}-${step}`,
  type,
  step,
  targets,
  controls,
});

describe('stepCircuitGate', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', {
      storage: {} as Record<string, string>,
      setItem(key: string, value: string) {
        this.storage[key] = value;
      },
      getItem(key: string) {
        return this.storage[key] ?? null;
      },
      removeItem(key: string) {
        delete this.storage[key];
      },
    });
    refreshCustomGateRegistry();
    registerCustomGate({
      id: 'AncillaMacro',
      source: 'PARAMS: Q0:1\nMAIN-PROCESS AncillaMacro\nH -I Q1:0 -O Q1:0\nRETURNVALS Q0',
    });
    refreshCustomGateRegistry();
  });

  it('tracks expanded state width across stepped custom gates', () => {
    let qubitCount = 2;
    let state = createInitialState(2);
    const customStep = stepCircuitGate(state, qubitCount, gate('AncillaMacro', 0, [1], [0]), {});
    qubitCount = customStep.qubitCount;
    state = customStep.result.state;
    expect(qubitCount).toBeGreaterThan(1);
    expect(state.length).toBe(2 ** qubitCount);

    const followUp = stepCircuitGate(state, qubitCount, gate('H', 1, [0]), {});
    expect(followUp.result.state.some((amplitude) => Math.abs(amplitude.re) > 1e-6 || Math.abs(amplitude.im) > 1e-6)).toBe(true);
  });
});
