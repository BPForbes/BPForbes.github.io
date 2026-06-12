import { describe, expect, it } from 'vitest';
import { ONE, scale, ZERO } from '../complex';
import { measureQubit, padStateVector, prepareZeroQubit } from '../gates/operations';
// Regression coverage for operations behavior.

describe('operations', () => {
  it('pads state vectors by shifting indices for appended |0⟩ wires', () => {
    const twoQubit = [ONE, ZERO, ZERO, ONE];
    const padded = padStateVector(twoQubit, 2, 3);
    expect(padded[0]).toEqual(ONE);
    expect(padded[6]).toEqual(ONE);
    expect(padded[1]).toEqual(ZERO);
  });

  it('resets a superposition with cancelling phases without wiping the full system', () => {
    const invSqrt2 = 1 / Math.sqrt(2);
    const state = [scale(ONE, invSqrt2), scale(ONE, -invSqrt2)];
    const reset = prepareZeroQubit(state, 1, 0);
    expect(reset[0].re).toBeCloseTo(1, 5);
    expect(reset[1].re).toBeCloseTo(0, 5);
  });

  it('resets a pure |1⟩ ancilla to |0⟩', () => {
    const reset = prepareZeroQubit([ZERO, ONE], 1, 0);
    expect(reset[0].re).toBeCloseTo(1, 5);
    expect(reset[1].re).toBeCloseTo(0, 5);
  });

  it('resets only the targeted qubit in a multi-qubit state', () => {
    const reset = prepareZeroQubit([ZERO, ZERO, ZERO, ONE], 2, 0);
    expect(reset[0].re).toBeCloseTo(0, 5);
    expect(reset[1].re).toBeCloseTo(1, 5);
    expect(reset[2].re).toBeCloseTo(0, 5);
    expect(reset[3].re).toBeCloseTo(0, 5);
  });

// Case: never collapses to an all-zero state when random equals 1 and P(1) is 1.
  it('never collapses to an all-zero state when random equals 1 and P(1) is 1', () => {
    const state = [ZERO, ONE];
    const measured = measureQubit(state, 1, 0, 1);
    expect(measured.value).toBe(1);
    expect(measured.state[1].re).toBeCloseTo(1, 5);
  });
});
