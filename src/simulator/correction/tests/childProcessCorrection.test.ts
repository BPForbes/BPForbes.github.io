import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  collectDescendantProcesses,
  correctChildProcessesForCompatibility,
  getReferencedChildProcesses,
  orderProcessesLeafFirst,
} from '../childProcessCorrection';
import { singleBitFullAdderTruthTable } from '../../compiler/truthTable';
// Covers descendant correction flows across nested processes.

const readProcess = (fileName: string) => readFileSync(new URL(`../../../data/processes/${fileName}`, import.meta.url), 'utf8');

const protocolLibrary = {
  SingleBitFullAdder: readProcess('single-bit-full-adder.qpucir'),
  TwoBitFullAdder: readProcess('two-bit-full-adder.qpucir'),
  FourBitFullAdder: readProcess('four-bit-full-adder.qpucir'),
};

describe('child process correction', () => {
  it('extracts declared and run children', () => {
    expect(getReferencedChildProcesses(protocolLibrary.TwoBitFullAdder)).toEqual(['SingleBitFullAdder']);
    expect(getReferencedChildProcesses(protocolLibrary.FourBitFullAdder)).toEqual(['TwoBitFullAdder']);
  });

  it('collects descendants for nested adders', () => {
    expect(collectDescendantProcesses('FourBitFullAdder', protocolLibrary).sort()).toEqual([
      'SingleBitFullAdder',
      'TwoBitFullAdder',
    ]);
  });

// Case: orders descendants leaf-first.
  it('orders descendants leaf-first', () => {
    expect(orderProcessesLeafFirst(
      collectDescendantProcesses('FourBitFullAdder', protocolLibrary),
      protocolLibrary,
    )).toEqual(['SingleBitFullAdder', 'TwoBitFullAdder']);
  });

// Case: corrects a broken child before parent compatibility checks.
  it('corrects a broken child before parent compatibility checks', () => {
    const brokenSingleBit = `PARAMS: A:state B:state Cin:state

MAIN-PROCESS SingleBitFullAdder
CREATETOKEN -I Sum Cout
SET Sum:0 0p
SET Cout:0 0p
RETURNVALS Cout Sum`;

    const library = {
      ...protocolLibrary,
      SingleBitFullAdder: brokenSingleBit,
    };

    const result = correctChildProcessesForCompatibility(
      'FourBitFullAdder',
      library,
      (name) => (name === 'SingleBitFullAdder' ? singleBitFullAdderTruthTable() : undefined),
      undefined,
      true,
    );

    const singleBit = result.childCorrections.find((entry) => entry.processName === 'SingleBitFullAdder');
    expect(singleBit?.corrected).toBe(true);
    expect(singleBit?.testResult.passed).toBe(true);
    expect(result.librarySources.SingleBitFullAdder).toContain('CNOT');
  });
});
