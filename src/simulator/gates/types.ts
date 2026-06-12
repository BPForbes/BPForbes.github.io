/**
 * Gate-definition contracts used by the registry and preconfigured gates.
 *
 * The metadata here describes both UI placement and execution semantics so a
 * registered gate can be rendered, parsed from AST source, and applied by the
 * simulator through one shape.
 */
import type { Complex } from '../complex';
import type { CircuitGate, ExecutionResult, MeasurementMap } from '../types';

export type GateCategory = 'preconfigured' | 'custom';

export type ControlKind = 'none' | 'single' | 'double' | 'swap' | 'parametric';

export type GateApplyContext = {
  state: Complex[];
  qubitCount: number;
  gate: CircuitGate;
  measurements: MeasurementMap;
  librarySources?: Record<string, string>;
};

// Input/output arity constraints for a QPU gate; max values default to the matching minimum.
export type GateIoArity = {
  minInputs: number;
  maxInputs?: number;
  minOutputs: number;
  maxOutputs?: number;
};

export const gateIoArity = (
  minInputs: number,
  minOutputs: number,
  maxInputs = minInputs,
  maxOutputs = minOutputs,
): GateIoArity => ({ minInputs, maxInputs, minOutputs, maxOutputs });

// Gate metadata combines palette rendering, AST parsing flags, and simulator execution.
export type GateDefinition = {
  id: string;
  category: GateCategory;
  label: string;
  controlKind: ControlKind;
  ioArity: GateIoArity;
  /** @deprecated Use ioArity.minInputs */
  astInputCount: number;
  inPalette: boolean;
  isAstPrimitive: boolean;
  isAstDerived: boolean;
  supportsReverse: boolean;
  supportsPhase: boolean;
  cssClass: string;
  color?: string;
  apply: (context: GateApplyContext) => ExecutionResult;
};
