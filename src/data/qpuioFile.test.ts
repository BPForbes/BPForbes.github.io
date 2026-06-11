import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { companionQpuioFileName, createQpuioPayload, parseQpuioPayload, serializeQpuioText } from './qpuioFile';
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

  it('rejects the MAIN-PROCES typo in qpuio headers', () => {
    const typo = `MAIN-PROCES: DemoGate
OUTPUTS: Y
#,Y
0,0p`;

    expect(() => parseQpuioPayload(typo)).toThrow(/MAIN-PROCESS:/i);
  });

  it('parses data rows with inline # comments', () => {
    const qpuio = `MAIN-PROCESS: RsNorLatchStep
INPUTS:  S  R  Qprev  QbarPrev
OUTPUTS: Q  Qbar
#  S  R  Qprev  QbarPrev  Q  Qbar
0  0p 0p 1p     0p        1p 0p    # hold
1  0p 0p 0p     1p        0p 1p    # hold
2  0p 1p 1p     0p        0p 1p    # reset
3  0p 1p 0p     1p        0p 1p    # reset
4  1p 0p 0p     1p        1p 0p    # set
5  1p 0p 1p     0p        1p 0p    # set
6  1p 1p 1p     0p        0p 0p    # invalid (both low)
7  1p 1p 0p     1p        0p 0p    # invalid`;

    const parsed = parseQpuioPayload(qpuio);
    expect(parsed.processName).toBe('RsNorLatchStep');
    expect(parsed.truthTable.inputColumns).toEqual(['S', 'R', 'Qprev', 'QbarPrev']);
    expect(parsed.truthTable.outputColumns).toEqual(['Q', 'Qbar']);
    expect(parsed.truthTable.rows).toHaveLength(8);
    expect(parsed.truthTable.rows[0]).toEqual(['0p', '0p', '1p', '0p', '1p', '0p']);
    expect(parsed.truthTable.rows[6]).toEqual(['1p', '1p', '1p', '0p', '0p', '0p']);
  });

  it('parses csv-style qpuio rows', () => {
    const csv = `MAIN-PROCESS: DemoGate
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

  it('builds companion qpuio names for qpucir and non-qpucir stems', () => {
    expect(companionQpuioFileName('adder.qpucir')).toBe('adder.qpuio');
    expect(companionQpuioFileName('RsNorLatchStep-qpucir.txt')).toBe('RsNorLatchStep-qpuio.txt');
    expect(companionQpuioFileName('custom-upload')).toBe('custom-upload.qpuio');
  });

  it('parses valid JSON qpuio envelopes', () => {
    const table = singleBitFullAdderTruthTable();
    const payload = createQpuioPayload('SingleBitFullAdder', table);
    const parsed = parseQpuioPayload(JSON.stringify(payload), protocol);
    expect(parsed.processName).toBe('SingleBitFullAdder');
    expect(truthTablesEqual(parsed.truthTable, table)).toBe(true);
  });

  it('rejects JSON qpuio envelopes with unsupported versions', () => {
    const table = singleBitFullAdderTruthTable();
    const payload = { ...createQpuioPayload('SingleBitFullAdder', table), version: 2 };
    expect(() => parseQpuioPayload(JSON.stringify(payload), protocol)).toThrow(/version to 1/i);
  });

  it('rejects JSON qpuio envelopes missing processName', () => {
    const table = singleBitFullAdderTruthTable();
    const payload = { ...createQpuioPayload('SingleBitFullAdder', table), processName: '  ' };
    expect(() => parseQpuioPayload(JSON.stringify(payload), protocol)).toThrow(/processName/i);
  });

  it('rejects JSON qpuio envelopes with non-string column names', () => {
    const table = singleBitFullAdderTruthTable();
    const payload = createQpuioPayload('SingleBitFullAdder', table);
    payload.inputColumns = [0 as unknown as string];
    expect(() => parseQpuioPayload(JSON.stringify(payload), protocol)).toThrow(/inputColumns\[0\] must be a string/i);
  });

  it('rejects JSON qpuio envelopes with invalid row cells', () => {
    const table = singleBitFullAdderTruthTable();
    const payload = createQpuioPayload('SingleBitFullAdder', table);
    payload.rows[0][0] = 'bad' as typeof payload.rows[0][0];
    expect(() => parseQpuioPayload(JSON.stringify(payload), protocol)).toThrow(/invalid value/i);
  });
});
