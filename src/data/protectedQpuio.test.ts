import { describe, expect, it } from 'vitest';
import {
  enforceProtectedTruthTable,
  getProtectedTruthTable,
  isProtectedQpuioProcess,
} from './protectedQpuio';
import { singleBitFullAdderTruthTable } from '../simulator/truthTable';

describe('protectedQpuio', () => {
  it('marks bundled adder and phase-demo processes as protected', () => {
    expect(isProtectedQpuioProcess('SingleBitFullAdder')).toBe(true);
    expect(isProtectedQpuioProcess('TwoBitFullAdder')).toBe(true);
    expect(isProtectedQpuioProcess('FourBitFullAdder')).toBe(true);
    expect(isProtectedQpuioProcess('PhaseDemo')).toBe(true);
    expect(isProtectedQpuioProcess('MyCircuit')).toBe(false);
  });

  it('reverts edited protected tables to canonical defaults', () => {
    const canonical = getProtectedTruthTable('SingleBitFullAdder');
    expect(canonical).toBeTruthy();

    const edited = singleBitFullAdderTruthTable();
    edited.rows[0] = ['1p', '1p', '1p', '1p', '1p'];

    const enforced = enforceProtectedTruthTable('SingleBitFullAdder', edited);
    expect(enforced?.reverted).toBe(true);
    expect(enforced?.truthTable).toEqual(canonical);
  });
});
