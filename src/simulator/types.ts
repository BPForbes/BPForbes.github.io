import { Complex } from './complex';

export type PrimitiveGateType = 'X' | 'H' | 'CNOT' | 'CCNOT' | 'PHASE' | 'MEASURE';
export type DerivedGateType = 'NOT' | 'AND' | 'NAND' | 'OR' | 'XOR';
export type GateType = PrimitiveGateType | DerivedGateType;

export const gateTypes = ['X', 'H', 'CNOT', 'CCNOT', 'PHASE', 'MEASURE', 'NOT', 'AND', 'NAND', 'OR', 'XOR'] as const satisfies readonly GateType[];
export const isGateType = (value: string): value is GateType => (gateTypes as readonly string[]).includes(value);

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

export type CircuitGate = {
  id: string;
  type: GateType;
  step: number;
  targets: number[];
  controls: number[];
  phase?: number;
  source?: string;
};

export type MeasurementMap = Record<number, 0 | 1>;

export type ExecutionResult = {
  state: Complex[];
  measurements: MeasurementMap;
  log: string[];
};
