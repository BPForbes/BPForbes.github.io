import { afterEach, describe, expect, it } from 'vitest';
import {
// Regression coverage for processCatalog behavior.
  getCatalogEntries,
  getCatalogEntry,
  persistCatalogArtifacts,
  registerCatalogProcess,
  registerCatalogTruthTable,
  resetProcessCatalogForTests,
  resolveCatalogEntry,
} from '../processCatalog';
import { singleBitFullAdderTruthTable } from '../../simulator/truthTable';

describe('processCatalog', () => {
  afterEach(() => {
    resetProcessCatalogForTests();
  });

  it('seeds bundled example processes', () => {
    const names = getCatalogEntries().map((entry) => entry.name);
    expect(names).toContain('SingleBitFullAdder');
    expect(names).toContain('PhaseDemo');
  });

  it('registers compiled and uploaded processes by name', () => {
    registerCatalogProcess({
      name: 'IMPLIES',
      source: 'PARAMS: A:state B:state\n\nMAIN-PROCESS IMPLIES\nRETURNVALS Y:0',
      origin: 'compiled',
      description: 'Incorrect implies gate experiment',
    });

    const entry = getCatalogEntry('IMPLIES');
    expect(entry?.origin).toBe('compiled');
    expect(entry?.description).toContain('implies');
  });

  it('resolves bundled processes by qpucir filename', () => {
    expect(resolveCatalogEntry('single-bit-full-adder.qpucir')?.name).toBe('SingleBitFullAdder');
    expect(resolveCatalogEntry('single-bit-full-adder')?.name).toBe('SingleBitFullAdder');
  });

// Case: resolves uploaded processes by original filename.
  it('resolves uploaded processes by original filename', () => {
    registerCatalogProcess({
      name: 'MyCircuit',
      source: 'MAIN-PROCESS MyCircuit\nRETURNVALS Y:0',
      origin: 'uploaded',
      fileName: 'custom-logic.qpucir',
    });
    expect(resolveCatalogEntry('custom-logic.qpucir')?.name).toBe('MyCircuit');
    expect(resolveCatalogEntry('custom-logic')?.name).toBe('MyCircuit');
  });

// Case: stores and retrieves bundled truth tables.
  it('stores and retrieves bundled truth tables', () => {
    expect(getCatalogEntry('SingleBitFullAdder')?.truthTable?.rows).toHaveLength(8);
    expect(getCatalogEntry('TwoBitFullAdder')?.truthTable?.rows).toHaveLength(32);
    expect(getCatalogEntry('FourBitFullAdder')?.truthTable?.rows).toHaveLength(512);
    expect(getCatalogEntry('PhaseDemo')?.truthTable?.rows).toHaveLength(1);
  });

// Case: does not update qpuio when persisting qpucir-only correction artifacts.
  it('does not update qpuio when persisting qpucir-only correction artifacts', () => {
    const originalTable = {
      inputColumns: ['S', 'R'],
      outputColumns: ['Q', 'Qbar'],
      rows: [
        ['0p', '0p', '0p', '1p'],
        ['0p', '1p', '0p', '1p'],
        ['1p', '0p', '1p', '0p'],
        ['1p', '1p', '0p', '0p'],
      ],
    };
    const originalSource = `PARAMS: S:state R:state

MAIN-PROCESS LatchStep
RETURNVALS Q Qbar`;

    registerCatalogProcess({
      name: 'LatchStep',
      source: originalSource,
      origin: 'uploaded',
      truthTable: originalTable,
    });

    const correctedSource = `${originalSource}\nCNOT -I 0:0 -O Q:0`;
    const probedTable = {
      inputColumns: ['S', 'R', 'Qprev'],
      outputColumns: ['Q'],
      rows: [['0p', '0p', '0p', '1p']],
    };

    const result = persistCatalogArtifacts({
      processName: 'LatchStep',
      source: correctedSource,
      truthTable: probedTable,
      updateQpuio: false,
      updateQpucir: true,
      origin: 'corrected',
    });

    expect(result.qpuioUpdated).toBe(false);
    expect(result.qpucirUpdated).toBe(true);
    expect(resolveCatalogEntry('LatchStep')?.source).toBe(correctedSource);
    expect(resolveCatalogEntry('LatchStep')?.truthTable).toEqual(originalTable);
  });

// Case: persists custom qpucir and qpuio metadata after workflow sync.
  it('persists custom qpucir and qpuio metadata after workflow sync', () => {
    registerCatalogProcess({
      name: 'MyCircuit',
      source: 'PARAMS: A:state B:state\n\nMAIN-PROCESS MyCircuit\nRETURNVALS Y:0',
      origin: 'uploaded',
      fileName: 'custom.qpucir',
    });

    const table = {
      inputColumns: ['A', 'B'],
      outputColumns: ['Y'],
      rows: [['0p', '0p', '0p'], ['0p', '1p', '1p'], ['1p', '0p', '1p'], ['1p', '1p', '0p']] as const,
    };

    const result = persistCatalogArtifacts({
      processName: 'MyCircuit',
      source: 'PARAMS: A:state B:state\n\nMAIN-PROCESS MyCircuit\nRETURNVALS Y:0',
      truthTable: table,
      updateQpuio: true,
      updateQpucir: true,
    });

    expect(result.skipped).toBe(false);
    expect(result.qpucirUpdated).toBe(true);
    expect(result.qpuioUpdated).toBe(true);
    expect(resolveCatalogEntry('MyCircuit')?.truthTable?.rows).toHaveLength(4);
    expect(resolveCatalogEntry('MyCircuit')?.truthTableFileName).toBe('MyCircuit.qpuio');
  });

// Case: skips persistence for bundled processes.
  it('skips persistence for bundled processes', () => {
    const result = persistCatalogArtifacts({
      processName: 'SingleBitFullAdder',
      source: 'MAIN-PROCESS SingleBitFullAdder\nRETURNVALS Cout Sum',
      truthTable: singleBitFullAdderTruthTable(),
    });
    expect(result.skipped).toBe(true);
  });

// Case: restores canonical qpuio filename for protected processes.
  it('restores canonical qpuio filename for protected processes', () => {
    const result = registerCatalogTruthTable({
      processName: 'SingleBitFullAdder',
      truthTable: structuredClone(getCatalogEntry('SingleBitFullAdder')!.truthTable!),
      truthTableFileName: 'hacked.qpuio',
    });
    expect(result.entry.truthTableFileName).toBe('single-bit-full-adder.qpuio');
  });

// Case: reverts protected truth-table registration to canonical metadata.
  it('reverts protected truth-table registration to canonical metadata', () => {
    const edited = structuredClone(getCatalogEntry('SingleBitFullAdder')!.truthTable!);
    edited.rows[0] = ['1p', '1p', '1p', '1p', '1p'];
    const result = registerCatalogTruthTable({
      processName: 'SingleBitFullAdder',
      truthTable: edited,
      truthTableFileName: 'hacked.qpuio',
    });
    expect(result.reverted).toBe(true);
    expect(result.entry.truthTable?.rows[0]).toEqual(['0p', '0p', '0p', '0p', '0p']);
  });
});
