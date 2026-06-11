import { Complex } from './complex';

export type PreconfiguredGateType =
  | 'X'
  | 'Y'
  | 'Z'
  | 'H'
  | 'S'
  | 'T'
  | 'CNOT'
  | 'CCNOT'
  | 'CZ'
  | 'CY'
  | 'SWAP'
  | 'PHASE'
  | 'MEASURE'
  | 'RESET'
  | 'NOT'
  | 'AND'
  | 'NAND'
  | 'OR'
  | 'XOR';

/** Built-in gates plus user-registered custom gate ids. */
export type GateType = PreconfiguredGateType | (string & {});

export type ParticleStartState = '0p' | '1p' | 'sp';

export const preconfiguredGateTypes = [
  'X',
  'Y',
  'Z',
  'H',
  'S',
  'T',
  'CNOT',
  'CCNOT',
  'CZ',
  'CY',
  'SWAP',
  'PHASE',
  'MEASURE',
  'NOT',
  'AND',
  'NAND',
  'OR',
  'XOR',
] as const satisfies readonly PreconfiguredGateType[];

/** @deprecated Use preconfiguredPaletteGates() from gates/registry for palette listing. */
export const gateTypes = [...preconfiguredGateTypes] as const;

export const isPreconfiguredGateType = (value: string): value is PreconfiguredGateType =>
  (preconfiguredGateTypes as readonly string[]).includes(value);

/** Palette/canvas guard — accepts preconfigured and registered custom gate ids. */
export const isGateType = (value: string): boolean => {
  if (isPreconfiguredGateType(value)) return true;
  try {
    // Lazy import avoided; registry checked at call sites via isKnownGateType when possible.
    return /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
  } catch {
    return false;
  }
};

export type QpuOperation =
  | 'INCREASECYCLE'
  | 'COMPILEPROCESS'
  | 'FREE'
  | 'SET'
  | 'JOIN'
  | 'SPLIT'
  | 'CALL'
  | 'DECLARECHILD'
  | 'RUNCHILD'
  | DerivedGateType
  | 'MEASURE'
  | 'RETURNVALS'
  | 'ACCEPTVALS'
  | 'MASTERVAL'
  | 'SAVE_STATE'
  | 'LOAD_STATE'
  | 'MAIN-PROCESS'
  | 'CREATETOKEN'
  | 'DELETETOKEN'
  | PrimitiveGateType;

export type PrimitiveGateType =
  | 'X'
  | 'Y'
  | 'Z'
  | 'H'
  | 'S'
  | 'T'
  | 'CNOT'
  | 'CCNOT'
  | 'CZ'
  | 'CY'
  | 'SWAP'
  | 'PHASE'
  | 'MEASURE'
  | 'RESET';

export type DerivedGateType = 'NOT' | 'AND' | 'NAND' | 'OR' | 'XOR';

export type CircuitGate = {
  id: string;
  type: GateType;
  step: number;
  targets: number[];
  controls: number[];
  phase?: number;
  source?: string;
  customGateId?: string;
};

export type MeasurementMap = Record<number, 0 | 1>;

export type { OperationTransition, ParticleDelta, ParticleSnapshot, SphericalCoordinates } from './particleTracking';

export type ExecutionResult = {
  state: Complex[];
  measurements: MeasurementMap;
  log: string[];
  /** Latest per-qubit spherical snapshots after this execution step. */
  particles?: import('./particleTracking').ParticleSnapshot[];
  /** Per-gate particle transitions when execution tracing is enabled. */
  transitions?: import('./particleTracking').OperationTransition[];
};
