import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { parseQpuioPayload, serializeQpuioText } from './qpuioFile';
import { singleBitFullAdderTruthTable, truthTablesEqual } from '../simulator/truthTable';

const readProcess = (fileName: string) => readFileSync(new URL(`./processes/${fileName}`, import.meta.url), 'utf8');

describe('qpuioFile', () => {
  const protocol = readProcess('single-bit-full-adder.qpucir');
  const bundledQpuio = readProcess('single-bit-full-adder.qpuio');

  it('parses bundled space-separated qpuio with protocol pairing', () => {
    const parsed = parseQpuioPayload(bundledQpuio, protocol);
    expect(parsed.processName).toBe('SingleBitFullAdder');
    expect(truthTablesEqual(parsed.truthTable, singleBitFullAdderTruthTable())).toBe(true);
  });

  it('parses csv-style qpuio rows', () => {
    const csv = `MAIN-PROCES: DemoGate
#,A,B,Y
0,0p,0p,0p
1,0p,1p,1p
2,1p,0p,1p
3,1p,1p,0p`;

    const parsed = parseQpuioPayload(csv, `PARAMS: A:state B:state

MAIN-PROCESS DemoGate
RETURNVALS Y`);
    expect(parsed.truthTable.inputColumns).toEqual(['A', 'B']);
    expect(parsed.truthTable.outputColumns).toEqual(['Y']);
    expect(parsed.truthTable.rows).toHaveLength(4);
  });

  it('round-trips through serializeQpuioText', () => {
    const table = singleBitFullAdderTruthTable();
    const serialized = serializeQpuioText('SingleBitFullAdder', table);
    const parsed = parseQpuioPayload(serialized, protocol);
    expect(truthTablesEqual(parsed.truthTable, table)).toBe(true);
  });
});
