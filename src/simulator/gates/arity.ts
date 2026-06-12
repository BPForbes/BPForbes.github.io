/**
 * Gate arity validation for AST commands and custom gate registration.
 *
 * The checks produce user-facing diagnostics instead of raw parser failures,
 * which helps correction guidance explain whether a command needs more inputs,
 * fewer outputs, or a different gate form.
 */
import { preconfiguredGateMap } from './preconfigured';
import type { GateDefinition, GateIoArity } from './types';

export type GateArityViolation =
  | { kind: 'too-many-inputs'; op: string; provided: number; max: number }
  | { kind: 'too-few-inputs'; op: string; provided: number; min: number }
  | { kind: 'too-many-outputs'; op: string; provided: number; max: number }
  | { kind: 'too-few-outputs'; op: string; provided: number; min: number };

export const resolvedArity = (arity: GateIoArity): Required<GateIoArity> => ({
  minInputs: arity.minInputs,
  maxInputs: arity.maxInputs ?? arity.minInputs,
  minOutputs: arity.minOutputs,
  maxOutputs: arity.maxOutputs ?? arity.minOutputs,
});

export const checkGateArity = (
  op: string,
  inputCount: number,
  outputCount: number,
  definition?: GateDefinition,
): GateArityViolation | null => {
  const gate = definition ?? preconfiguredGateMap[op];
  if (!gate) return null;

  const { minInputs, maxInputs, minOutputs, maxOutputs } = resolvedArity(gate.ioArity);

  if (inputCount > maxInputs) {
    return { kind: 'too-many-inputs', op, provided: inputCount, max: maxInputs };
  }
  if (inputCount < minInputs) {
    return { kind: 'too-few-inputs', op, provided: inputCount, min: minInputs };
  }
  if (outputCount > maxOutputs) {
    return { kind: 'too-many-outputs', op, provided: outputCount, max: maxOutputs };
  }
  if (outputCount < minOutputs) {
    return { kind: 'too-few-outputs', op, provided: outputCount, min: minOutputs };
  }

  return null;
};

export const formatGateArityViolation = (violation: GateArityViolation): string => {
  switch (violation.kind) {
    case 'too-many-inputs':
      return `${violation.op} received ${violation.provided} -I input(s) but allows at most ${violation.max}.`;
    case 'too-few-inputs':
      return `${violation.op} requires at least ${violation.min} -I input(s) but received ${violation.provided}.`;
    case 'too-many-outputs':
      return `${violation.op} received ${violation.provided} -O output(s) but allows at most ${violation.max}.`;
    case 'too-few-outputs':
      return `${violation.op} requires at least ${violation.min} -O output(s) but received ${violation.provided}.`;
  }
};

export const assertGateArity = (op: string, inputCount: number, outputCount: number, definition?: GateDefinition) => {
  const violation = checkGateArity(op, inputCount, outputCount, definition);
  if (violation) throw new Error(formatGateArityViolation(violation));
};
