import type { CircuitGate, ExecutionResult, MeasurementMap, PreconfiguredGateType } from '../types';
import type { Complex } from '../complex';
import type { GateDefinition } from './types';
import { preconfiguredGateMap, preconfiguredGates } from './preconfigured';
import { buildCustomGateDefinitions, getCustomGateRecord } from './customGateEngine';
import { astDerivedGateIds, astGateInputCounts, astPrimitiveGateIds } from './metadata';

export { astDerivedGateIds, astGateInputCounts, astPrimitiveGateIds };

let customDefinitions: GateDefinition[] = buildCustomGateDefinitions();

export const refreshCustomGateRegistry = () => {
  customDefinitions = buildCustomGateDefinitions();
};

const allDefinitions = () => [...preconfiguredGates, ...customDefinitions];

export const getGateDefinition = (id: string): GateDefinition | undefined => {
  if (preconfiguredGateMap[id]) return preconfiguredGateMap[id];
  return customDefinitions.find((gate) => gate.id === id);
};

export const isKnownGateType = (value: string): boolean => Boolean(getGateDefinition(value));

export const isCustomGateType = (value: string): boolean =>
  customDefinitions.some((gate) => gate.id === value);

export const preconfiguredPaletteGates = () =>
  preconfiguredGates.filter((gate) => gate.inPalette);

export const customPaletteGates = () =>
  customDefinitions.filter((gate) => gate.inPalette);

export const paletteGateIds = () => [
  ...preconfiguredPaletteGates().map((gate) => gate.id),
  ...customPaletteGates().map((gate) => gate.id),
];

export const gateLabels = (): Record<string, string> => {
  const labels: Record<string, string> = {};
  allDefinitions().forEach((gate) => {
    labels[gate.id] = gate.label;
  });
  return labels;
};

export const controlsForGateType = (
  type: string,
  target: number,
  qubitCount: number,
  secondTarget?: number,
): { controls: number[]; targets: number[] } | null => {
  const definition = getGateDefinition(type);
  if (!definition) return null;

  const candidates = Array.from({ length: qubitCount }, (_, qubit) => qubit).filter((qubit) => qubit !== target);

  if (definition.controlKind === 'swap') {
    const partner = secondTarget ?? candidates.find((qubit) => qubit !== target);
    if (partner === undefined || partner === target) return null;
    return { controls: [], targets: [target, partner] };
  }

  if (definition.controlKind === 'double') {
    if (candidates.length < 2) return null;
    return { controls: candidates.slice(0, 2), targets: [target] };
  }

  if (definition.controlKind === 'single' || definition.controlKind === 'parametric') {
    if (candidates.length < 1) return null;
    const inputCount = getCustomGateRecord(type)?.inputParamNames.length ?? 1;
    return {
      controls: candidates.slice(0, Math.max(1, inputCount)),
      targets: [target],
    };
  }

  return { controls: [], targets: [target] };
};

export const applyGate = (
  state: Complex[],
  qubitCount: number,
  gate: CircuitGate,
  measurements: MeasurementMap,
  librarySources: Record<string, string> = {},
): ExecutionResult => {
  const definition = getGateDefinition(gate.type);
  if (!definition) {
    throw new Error(`Unknown gate type '${gate.type}'.`);
  }
  return definition.apply({ state, qubitCount, gate, measurements, librarySources });
};

export const isPreconfiguredGateType = (value: string): value is PreconfiguredGateType =>
  value in preconfiguredGateMap;
