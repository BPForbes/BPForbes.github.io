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

export type GateDefinition = {
  id: string;
  category: GateCategory;
  label: string;
  controlKind: ControlKind;
  /** Minimum -I inputs required when parsing QPU AST lines. */
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
