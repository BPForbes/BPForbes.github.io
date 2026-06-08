import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { compileQpuProtocol, getReturnValToken } from './qpuAst';
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
