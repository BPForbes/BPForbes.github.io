import { add, Complex, complex, magnitudeSquared, mul, ONE, scale, ZERO } from './complex';
import { CircuitGate, ExecutionResult, MeasurementMap, ParticleStartState } from './types';

const INV_SQRT2 = 1 / Math.sqrt(2);
const X = [[ZERO, ONE], [ONE, ZERO]];
const H = [[complex(INV_SQRT2), complex(INV_SQRT2)], [complex(INV_SQRT2), complex(-INV_SQRT2)]];
const phaseMatrix = (angle: number) => [[ONE, ZERO], [ZERO, complex(Math.cos(angle), Math.sin(angle))]];

export const createInitialState = (
  qubitCount: number,
  startStates: ParticleStartState[] = [],
  paramQubitIndices?: number[],
): Complex[] => {
  let state = Array.from({ length: 2 ** qubitCount }, () => ZERO);
  state[0] = ONE;

  const indices = paramQubitIndices ?? Array.from({ length: Math.min(qubitCount, startStates.length) }, (_, qubit) => qubit);
  indices.forEach((qubit) => {
    if (qubit < 0 || qubit >= qubitCount) return;
    const startState = startStates[qubit] ?? '0p';
    if (startState === '1p') state = applySingleQubitGate(state, qubitCount, qubit, X);
    if (startState === 'sp') state = applySingleQubitGate(state, qubitCount, qubit, H);
  });

  return state;
};

export const basisLabel = (index: number, qubitCount: number): string => index.toString(2).padStart(qubitCount, '0');

const bitMask = (qubit: number, qubitCount: number) => 1 << (qubitCount - qubit - 1);
const hasBit = (basisIndex: number, qubit: number, qubitCount: number) => (basisIndex & bitMask(qubit, qubitCount)) !== 0;

export const applySingleQubitGate = (state: Complex[], qubitCount: number, target: number, matrix: Complex[][]): Complex[] => {
  const next = [...state];
  const mask = bitMask(target, qubitCount);

  for (let index = 0; index < state.length; index += 1) {
    if ((index & mask) === 0) {
      const zeroIndex = index;
      const oneIndex = index | mask;
      const zeroAmplitude = state[zeroIndex];
      const oneAmplitude = state[oneIndex];
      next[zeroIndex] = add(mul(matrix[0][0], zeroAmplitude), mul(matrix[0][1], oneAmplitude));
      next[oneIndex] = add(mul(matrix[1][0], zeroAmplitude), mul(matrix[1][1], oneAmplitude));
    }
  }

  return next;
};

const controlsAreActive = (basisIndex: number, qubitCount: number, controls: number[]) =>
  controls.every((control) => hasBit(basisIndex, control, qubitCount));

const controlsHaveParity = (basisIndex: number, qubitCount: number, controls: number[]) =>
  controls.filter((control) => hasBit(basisIndex, control, qubitCount)).length % 2 === 1;

const anyControlIsActive = (basisIndex: number, qubitCount: number, controls: number[]) =>
  controls.some((control) => hasBit(basisIndex, control, qubitCount));

export const applyControlledX = (state: Complex[], qubitCount: number, controls: number[], target: number): Complex[] => {
  return applyControlledPredicateX(state, qubitCount, controls, target, controlsAreActive);
};

export const applyControlledPredicateX = (
  state: Complex[],
  qubitCount: number,
  controls: number[],
  target: number,
  predicate: (basisIndex: number, qubitCount: number, controls: number[]) => boolean,
): Complex[] => {
  const next = [...state];
  const mask = bitMask(target, qubitCount);

  for (let index = 0; index < state.length; index += 1) {
    if ((index & mask) === 0 && predicate(index, qubitCount, controls)) {
      const pair = index | mask;
      next[index] = state[pair];
      next[pair] = state[index];
    }
  }

  return next;
};

export const prepareZeroQubit = (state: Complex[], qubitCount: number, qubit: number): Complex[] => {
  const mask = bitMask(qubit, qubitCount);
  const next = [...state];

  for (let index = 0; index < state.length; index += 1) {
    if ((index & mask) === 0) continue;
    const zeroIndex = index & ~mask;
    next[zeroIndex] = add(next[zeroIndex], state[index]);
    next[index] = ZERO;
  }

  const keptProbability = next.reduce((sum, amplitude) => sum + magnitudeSquared(amplitude), 0);
  if (keptProbability < 1e-12) {
    const zeroState = Array.from({ length: state.length }, () => ZERO);
    zeroState[0] = ONE;
    return zeroState;
  }

  const normalizer = 1 / Math.sqrt(keptProbability);
  return next.map((amplitude) => scale(amplitude, normalizer));
};

export const measureQubit = (
  state: Complex[],
  qubitCount: number,
  qubit: number,
  random = Math.random(),
): { state: Complex[]; value: 0 | 1; probabilityOne: number } => {
  const probabilityOne = state.reduce((sum, amplitude, index) => sum + (hasBit(index, qubit, qubitCount) ? magnitudeSquared(amplitude) : 0), 0);
  const value: 0 | 1 = random < probabilityOne ? 1 : 0;
  const keptProbability = value === 1 ? probabilityOne : 1 - probabilityOne;
  const normalizer = keptProbability > 0 ? 1 / Math.sqrt(keptProbability) : 0;

  const collapsed = state.map((amplitude, index) =>
    hasBit(index, qubit, qubitCount) === Boolean(value) ? scale(amplitude, normalizer) : ZERO,
  );

  return { state: collapsed, value, probabilityOne };
};

export const applyGate = (
  state: Complex[],
  qubitCount: number,
  gate: CircuitGate,
  measurements: MeasurementMap,
): ExecutionResult => {
  const target = gate.targets[0];
  const log: string[] = [];

  if (gate.type === 'X') {
    log.push(`X flipped q${target}.`);
    return { state: applySingleQubitGate(state, qubitCount, target, X), measurements, log };
  }

  if (gate.type === 'H') {
    log.push(`H put q${target} into superposition.`);
    return { state: applySingleQubitGate(state, qubitCount, target, H), measurements, log };
  }

  if (gate.type === 'PHASE') {
    const angle = gate.phase ?? 0;
    log.push(`PHASE(${angle.toFixed(3)}) rotated q${target}.`);
    return { state: applySingleQubitGate(state, qubitCount, target, phaseMatrix(angle)), measurements, log };
  }

  if (gate.type === 'RESET') {
    let nextState = state;
    gate.targets.forEach((qubit) => {
      nextState = prepareZeroQubit(nextState, qubitCount, qubit);
    });
    log.push(`Cycle workspace prepared: q${gate.targets.join(', q')} as |0⟩.`);
    return { state: nextState, measurements, log };
  }

  if (gate.type === 'CNOT' || gate.type === 'CCNOT' || gate.type === 'AND') {
    log.push(`${gate.type} used q${gate.controls.join(', q')} as control${gate.controls.length > 1 ? 's' : ''} and q${target} as target.`);
    return { state: applyControlledX(state, qubitCount, gate.controls, target), measurements, log };
  }

  if (gate.type === 'NOT') {
    log.push(`NOT flipped q${target}.`);
    return { state: applySingleQubitGate(state, qubitCount, target, X), measurements, log };
  }

  if (gate.type === 'NAND') {
    log.push(`NAND wrote the inverted conjunction of q${gate.controls.join(', q')} into q${target}.`);
    const andState = applyControlledX(state, qubitCount, gate.controls, target);
    return { state: applySingleQubitGate(andState, qubitCount, target, X), measurements, log };
  }

  if (gate.type === 'OR') {
    log.push(`OR flipped q${target} when any control was active.`);
    return { state: applyControlledPredicateX(state, qubitCount, gate.controls, target, anyControlIsActive), measurements, log };
  }

  if (gate.type === 'XOR') {
    log.push(`XOR flipped q${target} when controls had odd parity.`);
    return { state: applyControlledPredicateX(state, qubitCount, gate.controls, target, controlsHaveParity), measurements, log };
  }

  const measured = measureQubit(state, qubitCount, target);
  log.push(`Measured q${target} = ${measured.value} (P(1)=${measured.probabilityOne.toFixed(3)}).`);
  return { state: measured.state, measurements: { ...measurements, [target]: measured.value }, log };
};

export const runCircuit = (
  qubitCount: number,
  gates: CircuitGate[],
  startStates: ParticleStartState[] = [],
  paramQubitIndices?: number[],
): ExecutionResult => {
  const initSummary = paramQubitIndices?.length
    ? paramQubitIndices.map((qubit) => startStates[qubit] ?? '0p').join(' ')
    : Array.from({ length: qubitCount }, (_, index) => startStates[index] ?? '0p').join(' ');

  return gates
    .slice()
    .sort((a, b) => a.step - b.step)
    .reduce<ExecutionResult>(
      (result, gate) => {
        const next = applyGate(result.state, qubitCount, gate, result.measurements);
        return { state: next.state, measurements: next.measurements, log: [...result.log, ...next.log] };
      },
      {
        state: createInitialState(qubitCount, startStates, paramQubitIndices),
        measurements: {},
        log: [`Initialized ${initSummary}.`],
      },
    );
};

export const measureAll = (state: Complex[], qubitCount: number, measurements: MeasurementMap): ExecutionResult => {
  let current = state;
  const nextMeasurements = { ...measurements };
  const log: string[] = [];

  for (let qubit = 0; qubit < qubitCount; qubit += 1) {
    if (nextMeasurements[qubit] === undefined) {
      const measured = measureQubit(current, qubitCount, qubit);
      current = measured.state;
      nextMeasurements[qubit] = measured.value;
      log.push(`Measured q${qubit} = ${measured.value} (P(1)=${measured.probabilityOne.toFixed(3)}).`);
    }
  }

  return { state: current, measurements: nextMeasurements, log };
};
