import { describe, expect, it } from 'vitest';
import { ONE, ZERO } from './complex';
import { measureQubit, padStateVector } from './gates/operations';

describe('operations', () => {
  it('pads state vectors by shifting indices for appended |0⟩ wires', () => {
    const twoQubit = [ONE, ZERO, ZERO, ONE];
    const padded = padStateVector(twoQubit, 2, 3);
    expect(padded[0]).toEqual(ONE);
    expect(padded[6]).toEqual(ONE);
    expect(padded[1]).toEqual(ZERO);
  });

  it('never collapses to an all-zero state when random equals 1 and P(1) is 1', () => {
    const state = [ZERO, ONE];
    const measured = measureQubit(state, 1, 0, 1);
    expect(measured.value).toBe(1);
    expect(measured.state[1].re).toBeCloseTo(1, 5);
  });
});
