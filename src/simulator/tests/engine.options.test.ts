import { describe, expect, it } from 'vitest';
import { createInitialState, runCircuit } from '../engine';
import type { CircuitGate } from '../types';
// Guards execution-option normalization edge cases.
// Regression coverage for engine.options behavior.

const gate = (type: string, step: number, targets: number[]): CircuitGate => ({
  id: `${type}-${step}`,
  type,
  step,
  targets,
  controls: [],
});

describe('execution option normalization', () => {
  it('treats library maps with trackParticles keys as plain sources', () => {
    const librarySources = {
      trackParticles: 'child-process-source',
      librarySources: 'nested-source',
    };
    const result = runCircuit(1, [gate('H', 0, [0])], undefined, undefined, librarySources);
    expect(result.state.length).toBe(2);
    expect(createInitialState(1).length).toBe(2);
  });
});
