import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { compileQpuProtocol, getReturnValToken, visibleCircuitGates } from './qpuAst';
import { serializeCircuitToQpuProtocol } from './qpuFormat';
import { measureAll, runCircuit } from './engine';
import type { ParticleStartState } from './types';

const readProcess = (fileName: string) => readFileSync(new URL(`../data/processes/${fileName}`, import.meta.url), 'utf8');

const protocolLibrary = {
  SingleBitFullAdder: readProcess('single-bit-full-adder.qpucir'),
  TwoBitFullAdder: readProcess('two-bit-full-adder.qpucir'),
};

const tokenQubit = (tokenMap: Record<string, number>, name: string) => {
  const entry = Object.entries(tokenMap).find(([token]) => token === name || token.endsWith(`/${name}`));
  if (entry === undefined) throw new Error(`Missing token '${name}' in ${JSON.stringify(tokenMap)}`);
  return entry[1];
};

const setToken = (tokenMap: Record<string, number>, startStates: ParticleStartState[], name: string, value: ParticleStartState) => {
  startStates[tokenQubit(tokenMap, name)] = value;
};

const readMeasured = (tokenMap: Record<string, number>, measurements: Record<number, 0 | 1>, name: string) =>
  measurements[tokenQubit(tokenMap, name)];

describe('SingleBitFullAdder via TwoBitFullAdder', () => {
  it('writes child sum and carry into S0tmp, S1tmp, and Cmid', () => {
    const compiled = compileQpuProtocol(protocolLibrary.TwoBitFullAdder, protocolLibrary);
    const startStates = Array.from({ length: compiled.qubitCount }, () => '0p' as ParticleStartState);
    setToken(compiled.tokenMap, startStates, 'A0', '0p');
    setToken(compiled.tokenMap, startStates, 'A1', '1p');
    setToken(compiled.tokenMap, startStates, 'B0', '1p');
    setToken(compiled.tokenMap, startStates, 'B1', '0p');

    const executed = runCircuit(compiled.qubitCount, compiled.gates, startStates);
    const measured = measureAll(executed.state, compiled.qubitCount, executed.measurements);

    expect(readMeasured(compiled.tokenMap, measured.measurements, 'S0tmp')).toBe(1);
    expect(readMeasured(compiled.tokenMap, measured.measurements, 'S1tmp')).toBe(1);
    expect(readMeasured(compiled.tokenMap, measured.measurements, 'Cmid')).toBe(0);
  });
});

describe('process parameter exposure', () => {
  it('exposes only PARAMS entries for SingleBitFullAdder', () => {
    const compiled = compileQpuProtocol(protocolLibrary.SingleBitFullAdder, protocolLibrary);
    expect(compiled.processParams).toEqual([
      { name: 'A', type: '1', qubitIndex: expect.any(Number) },
      { name: 'B', type: '1', qubitIndex: expect.any(Number) },
      { name: 'Cin', type: '1', qubitIndex: expect.any(Number) },
    ]);
    expect(compiled.processParams).toHaveLength(3);
    expect(compiled.qubitCount).toBeGreaterThan(3);
  });

  it('excludes reset targets from process parameters in FourBitFullAdder', () => {
    const source = readProcess('four-bit-full-adder.qpucir');
    const compiled = compileQpuProtocol(source, protocolLibrary);
    expect(compiled.processParams.map((param) => param.name)).toEqual([
      'A0', 'A1', 'A2', 'A3', 'B0', 'B1', 'B2', 'B3', 'Cin',
    ]);
    expect(compiled.gates.some((gate) => gate.type === 'RESET')).toBe(true);
    expect(visibleCircuitGates(compiled.gates).some((gate) => gate.type === 'RESET')).toBe(false);
  });

  it('does not inflate qubit count when a compiled circuit is serialized and recompiled', () => {
    const first = compileQpuProtocol(protocolLibrary.SingleBitFullAdder, protocolLibrary);
    const roundTripSource = serializeCircuitToQpuProtocol(first.gates, first.qubitCount);
    const second = compileQpuProtocol(roundTripSource, protocolLibrary);

    expect(second.qubitCount).toBe(first.qubitCount);
    expect(second.processParams).toHaveLength(first.qubitCount);
  });
});

describe('SingleBitFullAdder standalone', () => {
  it('computes sum and carry from RETURNVALS register names', () => {
    const source = protocolLibrary.SingleBitFullAdder;
    const compiled = compileQpuProtocol(source, protocolLibrary);
    const startStates = Array.from({ length: compiled.qubitCount }, () => '0p' as ParticleStartState);
    setToken(compiled.tokenMap, startStates, 'A', '1p');
    setToken(compiled.tokenMap, startStates, 'B', '1p');
    setToken(compiled.tokenMap, startStates, 'Cin', '0p');

    const executed = runCircuit(compiled.qubitCount, compiled.gates, startStates);
    const measured = measureAll(executed.state, compiled.qubitCount, executed.measurements);

    const sumQubit = tokenQubit(compiled.tokenMap, getReturnValToken(source, 0));
    const carryQubit = tokenQubit(compiled.tokenMap, getReturnValToken(source, 1));
    expect(measured.measurements[sumQubit]).toBe(0);
    expect(measured.measurements[carryQubit]).toBe(1);
  });
});

describe('TwoBitFullAdder', () => {
  it('adds |10> and |01> to produce sum 3', () => {
    const compiled = compileQpuProtocol(protocolLibrary.TwoBitFullAdder, protocolLibrary);
    const startStates = Array.from({ length: compiled.qubitCount }, () => '0p' as ParticleStartState);
    setToken(compiled.tokenMap, startStates, 'A0', '0p');
    setToken(compiled.tokenMap, startStates, 'A1', '1p');
    setToken(compiled.tokenMap, startStates, 'B0', '1p');
    setToken(compiled.tokenMap, startStates, 'B1', '0p');

    const executed = runCircuit(compiled.qubitCount, compiled.gates, startStates);
    const measured = measureAll(executed.state, compiled.qubitCount, executed.measurements);

    expect(readMeasured(compiled.tokenMap, measured.measurements, 'S0tmp')).toBe(1);
    expect(readMeasured(compiled.tokenMap, measured.measurements, 'S1tmp')).toBe(1);
    expect(readMeasured(compiled.tokenMap, measured.measurements, 'Cout')).toBe(0);
  });

  it('ignores incorrect 1p start states on child output registers', () => {
    const compiled = compileQpuProtocol(protocolLibrary.TwoBitFullAdder, protocolLibrary);
    const startStates = Array.from({ length: compiled.qubitCount }, () => '0p' as ParticleStartState);
    setToken(compiled.tokenMap, startStates, 'A0', '0p');
    setToken(compiled.tokenMap, startStates, 'A1', '1p');
    setToken(compiled.tokenMap, startStates, 'B0', '1p');
    setToken(compiled.tokenMap, startStates, 'B1', '0p');
    setToken(compiled.tokenMap, startStates, 'S0tmp', '1p');
    setToken(compiled.tokenMap, startStates, 'Cmid', '1p');
    setToken(compiled.tokenMap, startStates, 'S1tmp', '1p');
    setToken(compiled.tokenMap, startStates, 'Cout', '1p');

    const executed = runCircuit(compiled.qubitCount, compiled.gates, startStates);
    const measured = measureAll(executed.state, compiled.qubitCount, executed.measurements);

    expect(readMeasured(compiled.tokenMap, measured.measurements, 'S0tmp')).toBe(1);
    expect(readMeasured(compiled.tokenMap, measured.measurements, 'S1tmp')).toBe(1);
    expect(readMeasured(compiled.tokenMap, measured.measurements, 'Cout')).toBe(0);
  });
});

describe('FourBitFullAdder nested children', () => {
  it('computes low-nibble 2 + 1 = 3', () => {
    const source = readProcess('four-bit-full-adder.qpucir');
    const compiled = compileQpuProtocol(source, protocolLibrary);
    const startStates = Array.from({ length: compiled.qubitCount }, () => '0p' as ParticleStartState);

    setToken(compiled.tokenMap, startStates, 'A0', '0p');
    setToken(compiled.tokenMap, startStates, 'A1', '1p');
    setToken(compiled.tokenMap, startStates, 'A2', '0p');
    setToken(compiled.tokenMap, startStates, 'A3', '0p');
    setToken(compiled.tokenMap, startStates, 'B0', '1p');
    setToken(compiled.tokenMap, startStates, 'B1', '0p');
    setToken(compiled.tokenMap, startStates, 'B2', '0p');
    setToken(compiled.tokenMap, startStates, 'B3', '0p');
    setToken(compiled.tokenMap, startStates, 'Cin', '0p');

    const executed = runCircuit(compiled.qubitCount, compiled.gates, startStates);
    const measured = measureAll(executed.state, compiled.qubitCount, executed.measurements);

    expect(readMeasured(compiled.tokenMap, measured.measurements, 'Sum0')).toBe(1);
    expect(readMeasured(compiled.tokenMap, measured.measurements, 'Sum1')).toBe(1);
    expect(readMeasured(compiled.tokenMap, measured.measurements, 'Sum2')).toBe(0);
    expect(readMeasured(compiled.tokenMap, measured.measurements, 'Sum3')).toBe(0);
    expect(readMeasured(compiled.tokenMap, measured.measurements, 'C4')).toBe(0);
  });
});
