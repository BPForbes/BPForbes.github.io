import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  formatAddressLabel,
  getAddressCandidates,
  resolveWireAddress,
} from '../addressResolution';
import type { NlCorrectionContext } from '../llm/intentTypes';

const singleBitSource = readFileSync(new URL('../../data/processes/single-bit-full-adder.qpucir', import.meta.url), 'utf8');
const twoBitSource = readFileSync(new URL('../../data/processes/two-bit-full-adder.qpucir', import.meta.url), 'utf8');

const singleBitContext: NlCorrectionContext = {
  source: singleBitSource,
  truthTable: null,
  inputColumns: ['A', 'B', 'Cin'],
  outputColumns: ['Cout', 'Sum'],
};

const twoBitContext: NlCorrectionContext = {
  source: twoBitSource,
  truthTable: null,
  inputColumns: ['A0', 'A1', 'B0', 'B1', 'Cin'],
  outputColumns: ['Cout', 'S1tmp', 'S0tmp'],
};

describe('resolveWireAddress', () => {
  it('resolves explicit wire addresses in source', () => {
    expect(resolveWireAddress('1:0', singleBitContext)).toEqual({ status: 'resolved', address: '1:0' });
    expect(resolveWireAddress('0:0', singleBitContext)).toEqual({ status: 'resolved', address: '0:0' });
  });

  it('resolves register names to a single binding', () => {
    expect(resolveWireAddress('A', singleBitContext).status).toBe('resolved');
    expect(resolveWireAddress('$A', singleBitContext).status).toBe('resolved');
  });

  it('asks for clarification when a requested bit is missing', () => {
    const resolution = resolveWireAddress('$A0:1', twoBitContext);
    expect(resolution.status).toBe('clarify');
    if (resolution.status === 'clarify') {
      expect(resolution.candidates).toContain('A0:0');
      expect(resolution.prompt).toContain('$A0:1');
    }
  });

  it('collects wire and register aliases for the same param', () => {
    const candidates = getAddressCandidates('$A0', twoBitContext);
    expect(candidates).toEqual(expect.arrayContaining(['A0', 'A0:0']));
    expect(resolveWireAddress('$A0', twoBitContext).status).toBe('resolved');
  });
});

// Test group: formatAddressLabel.
describe('formatAddressLabel', () => {
// Case: shows param aliases for wire addresses.
  it('shows param aliases for wire addresses', () => {
    expect(formatAddressLabel('0:0', singleBitContext)).toBe('0:0 ($A)');
    expect(formatAddressLabel('A0:0', twoBitContext)).toBe('A0:0 ($A0)');
  });
});
