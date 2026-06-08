import { readFileSync } from 'fs';
import { compileQpuProtocol } from './qpuAst';
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

const assertEqual = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};

const testSingleBitFullAdderChildOutputs = () => {
  const compiled = compileQpuProtocol(protocolLibrary.TwoBitFullAdder, protocolLibrary);
  const startStates = Array.from({ length: compiled.qubitCount }, () => '0p' as ParticleStartState);
  setToken(compiled.tokenMap, startStates, 'A0', '0p');
  setToken(compiled.tokenMap, startStates, 'A1', '1p');
  setToken(compiled.tokenMap, startStates, 'B0', '1p');
  setToken(compiled.tokenMap, startStates, 'B1', '0p');

  const executed = runCircuit(compiled.qubitCount, compiled.gates, startStates);
  const measured = measureAll(executed.state, compiled.qubitCount, executed.measurements);

  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'S0tmp'), 1, 'single-bit child sum bit 0');
  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'S1tmp'), 1, 'single-bit child sum bit 1');
  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'Cmid'), 0, 'single-bit child carry between nibbles');
};

const testSingleBitFullAdderStandalone = () => {
  const source = protocolLibrary.SingleBitFullAdder;
  const compiled = compileQpuProtocol(source, protocolLibrary);
  const startStates = Array.from({ length: compiled.qubitCount }, () => '0p' as ParticleStartState);
  setToken(compiled.tokenMap, startStates, 'A', '1p');
  setToken(compiled.tokenMap, startStates, 'B', '1p');
  setToken(compiled.tokenMap, startStates, 'Cin', '0p');

  const executed = runCircuit(compiled.qubitCount, compiled.gates, startStates);
  const measured = measureAll(executed.state, compiled.qubitCount, executed.measurements);

  const sumQubit = tokenQubit(compiled.tokenMap, '3');
  const carryQubit = tokenQubit(compiled.tokenMap, '4');
  assertEqual(measured.measurements[sumQubit], 0, 'standalone single-bit sum');
  assertEqual(measured.measurements[carryQubit], 1, 'standalone single-bit carry');
};

const testTwoBitFullAdder = () => {
  const compiled = compileQpuProtocol(protocolLibrary.TwoBitFullAdder, protocolLibrary);
  const startStates = Array.from({ length: compiled.qubitCount }, () => '0p' as ParticleStartState);
  setToken(compiled.tokenMap, startStates, 'A0', '0p');
  setToken(compiled.tokenMap, startStates, 'A1', '1p');
  setToken(compiled.tokenMap, startStates, 'B0', '1p');
  setToken(compiled.tokenMap, startStates, 'B1', '0p');

  const executed = runCircuit(compiled.qubitCount, compiled.gates, startStates);
  const measured = measureAll(executed.state, compiled.qubitCount, executed.measurements);

  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'S0tmp'), 1, 'two-bit sum0');
  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'S1tmp'), 1, 'two-bit sum1');
  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'Cout'), 0, 'two-bit cout');
};

const testFourBitFullAdder = () => {
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

  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'Sum0'), 1, 'four-bit sum0');
  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'Sum1'), 1, 'four-bit sum1');
  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'Sum2'), 0, 'four-bit sum2');
  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'Sum3'), 0, 'four-bit sum3');
  assertEqual(readMeasured(compiled.tokenMap, measured.measurements, 'C4'), 0, 'four-bit final carry');
};

const tests = [
  ['SingleBitFullAdder standalone', testSingleBitFullAdderStandalone],
  ['SingleBitFullAdder via TwoBitFullAdder', testSingleBitFullAdderChildOutputs],
  ['TwoBitFullAdder', testTwoBitFullAdder],
  ['FourBitFullAdder nested children', testFourBitFullAdder],
] as const;

let failures = 0;
for (const [name, test] of tests) {
  try {
    test();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`fail - ${name}: ${message}`);
  }
}

if (failures > 0) process.exit(1);
