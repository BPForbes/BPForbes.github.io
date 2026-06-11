import { describe, expect, it } from 'vitest';
import { createInitialState, runCircuit } from './engine';
import { blochVectorForQubit, particleDelta, snapshotParticle, sphericalFromBloch } from './particleTracking';
import type { CircuitGate } from './types';

const gate = (type: string, step: number, targets: number[], controls: number[] = []): CircuitGate => ({
  id: `${type}-${step}`,
  type,
  step,
  targets,
  controls,
});

describe('particleTracking', () => {
  it('maps |0⟩ to the north pole of the Bloch sphere', () => {
    const state = createInitialState(1);
    const bloch = blochVectorForQubit(state, 1, 0);
    expect(bloch.z).toBeCloseTo(1, 5);
    const spherical = sphericalFromBloch(bloch);
    expect(spherical.r).toBeCloseTo(1, 5);
    expect(spherical.theta).toBeCloseTo(0, 5);
  });

  it('detects particle movement after a Hadamard gate', () => {
    const initial = snapshotParticle(createInitialState(1), 1, 0);
    const afterH = snapshotParticle(runCircuit(1, [gate('H', 0, [0])], undefined, undefined, { trackParticles: true }).state, 1, 0);
    const delta = particleDelta(initial, afterH);
    expect(delta.displacement).toBeGreaterThan(0.5);
    expect(delta.deltaTheta).toBeGreaterThan(0.5);
  });

  it('records transitions when runCircuit tracking is enabled', () => {
    const result = runCircuit(2, [gate('H', 0, [0]), gate('CNOT', 1, [1], [0])], undefined, undefined, {
      trackParticles: true,
    });
    expect(result.transitions).toHaveLength(2);
    expect(result.transitions?.[0].inputQubits).toEqual([0]);
    expect(result.transitions?.[1].inputQubits).toEqual([0]);
    expect(result.transitions?.[1].outputQubits).toEqual([1]);
  });
});
