import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  fourBitFullAdderTruthTable,
  phaseDemoTruthTable,
  twoBitFullAdderTruthTable,
} from './bundledTruthTables';
import { serializeQpuioText } from './qpuioFile';

const readFixture = (fileName: string) => readFileSync(new URL(`./processes/${fileName}`, import.meta.url), 'utf8');

const phaseDemoQpuioText = () => {
  const serialized = serializeQpuioText('PhaseDemo', phaseDemoTruthTable());
  return serialized.replace('MAIN-PROCES: PhaseDemo\n', 'MAIN-PROCES: PhaseDemo\nOUTPUTS: Q0\n');
};

describe('generate bundled qpuio', () => {
  it('matches checked-in bundled qpuio fixtures', () => {
    expect(serializeQpuioText('TwoBitFullAdder', twoBitFullAdderTruthTable())).toBe(readFixture('two-bit-full-adder.qpuio'));
    expect(serializeQpuioText('FourBitFullAdder', fourBitFullAdderTruthTable())).toBe(readFixture('four-bit-full-adder.qpuio'));
    expect(phaseDemoQpuioText()).toBe(readFixture('phase-demo.qpuio'));
  });
});
