import { Complex, magnitudeSquared, ONE, ZERO } from './complex';
import { applyGate as applyRegisteredGate } from './gates/registry';
import { applyStartState, hasBit, measureQubit, padStateVector } from './gates/operations';
import { CircuitGate, ExecutionResult, MeasurementMap, ParticleStartState } from './types';

export {
  applySingleQubitGate,
  applyControlledX,
  applyControlledPredicateX,
  hasBit,
  measureQubit,
  prepareZeroQubit,
} from './gates/operations';

export const basisLabel = (index: number, qubitCount: number): string => index.toString(2).padStart(qubitCount, '0');

/** Marginalize a state vector onto the selected qubit indices for logical-param display. */
export const projectStateOntoQubits = (
  state: Complex[],
  sourceQubitCount: number,
  qubits: number[],
): Complex[] => {
  const targetCount = qubits.length;
  const probabilities = Array.from({ length: 2 ** targetCount }, () => 0);

  state.forEach((amplitude, sourceIndex) => {
    const probability = magnitudeSquared(amplitude);
    if (probability < 1e-20) return;
    let targetIndex = 0;
    qubits.forEach((sourceQubit) => {
      targetIndex = (targetIndex << 1) | (hasBit(sourceIndex, sourceQubit, sourceQubitCount) ? 1 : 0);
    });
    probabilities[targetIndex] += probability;
  });

  return probabilities.map((probability) => (probability > 0 ? { re: Math.sqrt(probability), im: 0 } : ZERO));
};

export const createInitialState = (
  qubitCount: number,
  startStates: ParticleStartState[] = [],
  paramQubitIndices?: number[],
): Complex[] => {
  let state = Array.from({ length: 2 ** qubitCount }, () => ZERO);
  state[0] = ONE;

  const indices = paramQubitIndices ?? Array.from({ length: Math.min(qubitCount, startStates.length) }, (_, qubit) => qubit);
  const invalid = indices.filter((qubit) => qubit < 0 || qubit >= qubitCount);
  if (invalid.length > 0) {
    throw new RangeError(`Invalid qubit indices: ${invalid.join(', ')} (qubitCount=${qubitCount})`);
  }
  indices.forEach((qubit) => {
    const startState = startStates[qubit] ?? '0p';
    if (startState === '1p') state = applyStartState(state, qubitCount, qubit, '1p');
    if (startState === 'sp') state = applyStartState(state, qubitCount, qubit, 'sp');
  });

  return state;
};

const ensureStateWidth = (state: Complex[], qubitCount: number, gate: CircuitGate) => {
  const touched = [...gate.targets, ...gate.controls];
  if (touched.length === 0) return { state, qubitCount };
  const maxWire = Math.max(...touched);
  if (maxWire < qubitCount) return { state, qubitCount };
  const nextCount = maxWire + 1;
  return { state: padStateVector(state, qubitCount, nextCount), qubitCount: nextCount };
};

export const applyGate = (
  state: Complex[],
  qubitCount: number,
  gate: CircuitGate,
  measurements: MeasurementMap,
  librarySources: Record<string, string> = {},
): ExecutionResult => applyRegisteredGate(state, qubitCount, gate, measurements, librarySources);

export const runCircuit = (
  qubitCount: number,
  gates: CircuitGate[],
  startStates: ParticleStartState[] = [],
  paramQubitIndices?: number[],
  librarySources: Record<string, string> = {},
): ExecutionResult => {
  const initSummary = paramQubitIndices?.length
    ? paramQubitIndices.map((qubit) => startStates[qubit] ?? '0p').join(' ')
    : Array.from({ length: qubitCount }, (_, index) => startStates[index] ?? '0p').join(' ');

  let workingQubitCount = qubitCount;
  let workingState = createInitialState(qubitCount, startStates, paramQubitIndices);

  return gates
    .slice()
    .sort((a, b) => a.step - b.step)
    .reduce<ExecutionResult>(
      (result, gate) => {
        const sized = ensureStateWidth(workingState, workingQubitCount, gate);
        workingState = sized.state;
        workingQubitCount = sized.qubitCount;
        const next = applyGate(workingState, workingQubitCount, gate, result.measurements, librarySources);
        workingState = next.state;
        const vectorWidth = Math.round(Math.log2(workingState.length));
        if (Number.isFinite(vectorWidth) && vectorWidth > workingQubitCount) {
          workingQubitCount = vectorWidth;
        }
        return { state: workingState, measurements: next.measurements, log: [...result.log, ...next.log] };
      },
      {
        state: workingState,
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
