import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
// Regression coverage for generateBundledQpuio behavior.
  fourBitFullAdderTruthTable,
  phaseDemoTruthTable,
  twoBitFullAdderTruthTable,
} from '../bundledTruthTables';
import { serializeQpuioText } from '../qpuioFile';

const readFixture = (fileName: string) => readFileSync(new URL(`../processes/${fileName}`, import.meta.url), 'utf8');

describe('generate bundled qpuio', () => {
  it('matches checked-in bundled qpuio fixtures', () => {
    expect(serializeQpuioText('TwoBitFullAdder', twoBitFullAdderTruthTable())).toBe(readFixture('two-bit-full-adder.qpuio'));
    expect(serializeQpuioText('FourBitFullAdder', fourBitFullAdderTruthTable())).toBe(readFixture('four-bit-full-adder.qpuio'));
    expect(serializeQpuioText('PhaseDemo', phaseDemoTruthTable())).toBe(readFixture('phase-demo.qpuio'));
  });
});
