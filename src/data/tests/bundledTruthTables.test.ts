import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { fourBitFullAdderTruthTable, phaseDemoTruthTable, twoBitFullAdderTruthTable } from '../bundledTruthTables';
import { parseQpuioPayload } from '../qpuioFile';
import { simulateTruthTableOutputs, truthTablesEqual, validateTruthTable } from '../../simulator/truthTable';

const readProcess = (fileName: string) => readFileSync(new URL(`../processes/${fileName}`, import.meta.url), 'utf8');

describe('bundledTruthTables', () => {
  it('matches simulated two-bit adder outputs for all rows', () => {
    const library = {
      SingleBitFullAdder: readProcess('single-bit-full-adder.qpucir'),
      TwoBitFullAdder: readProcess('two-bit-full-adder.qpucir'),
    };
    const simulated = simulateTruthTableOutputs(library.TwoBitFullAdder, library);
    const canonical = twoBitFullAdderTruthTable();

    expect(canonical.rows).toEqual(simulated.rows);
    expect(canonical.inputColumns).toEqual(simulated.inputColumns);
    expect(canonical.outputColumns).toEqual(simulated.outputColumns);
  });

  it('parses bundled four-bit qpuio metadata with full schema', () => {
    const protocol = readProcess('four-bit-full-adder.qpucir');
    const qpuio = readProcess('four-bit-full-adder.qpuio');
    const parsed = parseQpuioPayload(qpuio, protocol);
    const canonical = fourBitFullAdderTruthTable();

    expect(parsed.processName).toBe('FourBitFullAdder');
    expect(parsed.truthTable.inputColumns).toEqual(canonical.inputColumns);
    expect(parsed.truthTable.outputColumns).toEqual(canonical.outputColumns);
    expect(parsed.truthTable.rows).toHaveLength(512);
    expect(parsed.truthTable.rows[0]).toEqual(canonical.rows[0]);
    expect(parsed.truthTable.rows[255]).toEqual(canonical.rows[255]);
    expect(parsed.truthTable.rows[511]).toEqual(canonical.rows[511]);
    expect(validateTruthTable(parsed.truthTable, protocol)).toEqual([]);
  });

  it('aligns phase-demo truth table with its protocol', () => {
    const protocol = readProcess('phase-demo.qpucir');
    const qpuio = readProcess('phase-demo.qpuio');
    const parsed = parseQpuioPayload(qpuio, protocol);
    const canonical = phaseDemoTruthTable();

    expect(truthTablesEqual(parsed.truthTable, canonical)).toBe(true);
    expect(validateTruthTable(canonical, protocol)).toEqual([]);
  });
});
