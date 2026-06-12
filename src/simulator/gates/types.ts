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

export type GateIoArity = {
  /** Minimum tokens required on -I. */
  minInputs: number;
  /** Maximum tokens allowed on -I (defaults to minInputs). */
  maxInputs?: number;
  /** Minimum tokens required on -O. */
  minOutputs: number;
  /** Maximum tokens allowed on -O (defaults to minOutputs). */
  maxOutputs?: number;
};

export const gateIoArity = (
  minInputs: number,
  minOutputs: number,
  maxInputs = minInputs,
  maxOutputs = minOutputs,
): GateIoArity => ({ minInputs, maxInputs, minOutputs, maxOutputs });

export type GateDefinition = {
  id: string;
  category: GateCategory;
  label: string;
  controlKind: ControlKind;
  /** -I / -O arity for QPU AST parsing and compatibility checks. */
  ioArity: GateIoArity;
  /** @deprecated Use ioArity.minInputs */
  astInputCount: number;
  inPalette: boolean;
  /** Whether this gate is lowered from QPU AST primitive commands. */
  isAstPrimitive: boolean;
  /** Whether this gate is a derived Boolean gate in the AST. */
  isAstDerived: boolean;
  supportsReverse: boolean;
  supportsPhase: boolean;
  cssClass: string;
  /** CSS gradient or solid color for custom-style rendering. */
  color?: string;
  apply: (context: GateApplyContext) => ExecutionResult;
};
