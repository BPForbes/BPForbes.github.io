import { describe, expect, it } from 'vitest';
import { checkGateArity, formatGateArityViolation } from '../arity';
import { parseCommand } from '../../compiler/qpuAst';
describe('gate arity validation', () => {
  it('rejects too many -I parameters for CNOT', () => {
    const violation = checkGateArity('CNOT', 2, 1);
    expect(violation?.kind).toBe('too-many-inputs');
    expect(formatGateArityViolation(violation!)).toContain('at most 1');
  });

  it('rejects too few -O parameters for single-qubit gates', () => {
    const violation = checkGateArity('X', 1, 0);
    expect(violation?.kind).toBe('too-few-outputs');
  });

  it('rejects too few -I parameters for SWAP', () => {
    const violation = checkGateArity('SWAP', 1, 2);
    expect(violation?.kind).toBe('too-few-inputs');
  });

  it('parses valid SWAP arity through the AST parser', () => {
    const command = parseCommand('SWAP -I $Q0:0 $Q1:0 -O $Q0:0 $Q1:0');
    expect(command.op).toBe('SWAP');
    expect(command.inputs).toHaveLength(2);
    expect(command.outputs).toHaveLength(2);
  });

// Case: throws when CCNOT is missing a control input.
  it('throws when CCNOT is missing a control input', () => {
    expect(() => parseCommand('CCNOT -I $Q0:0 -O $Q2:0')).toThrow(/at least 2 -I/);
  });
});
