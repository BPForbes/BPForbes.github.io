import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { twoBitFullAdderTruthTable } from './bundledTruthTables';
import { parseQpuioPayload } from './qpuioFile';
import { simulateTruthTableOutputs } from '../simulator/truthTable';

const readProcess = (fileName: string) => readFileSync(new URL(`./processes/${fileName}`, import.meta.url), 'utf8');

describe('bundledTruthTables', () => {
  it('matches simulated two-bit adder outputs for sample rows', () => {
    const library = {
      SingleBitFullAdder: readProcess('single-bit-full-adder.qpucir'),
      TwoBitFullAdder: readProcess('two-bit-full-adder.qpucir'),
    };
    const simulated = simulateTruthTableOutputs(library.TwoBitFullAdder, library);
    const canonical = twoBitFullAdderTruthTable();

    [0, 3, 7, 15, 31].forEach((rowIndex) => {
      expect(canonical.rows[rowIndex]).toEqual(simulated.rows[rowIndex]);
    });
  });

  it('parses bundled four-bit qpuio metadata', () => {
    const protocol = readProcess('four-bit-full-adder.qpucir');
    const qpuio = readProcess('four-bit-full-adder.qpuio');
    const parsed = parseQpuioPayload(qpuio, protocol);
    expect(parsed.processName).toBe('FourBitFullAdder');
    expect(parsed.truthTable.rows).toHaveLength(512);
  });
});
