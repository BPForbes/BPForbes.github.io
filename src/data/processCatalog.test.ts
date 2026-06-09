import { afterEach, describe, expect, it } from 'vitest';
import {
  getCatalogEntries,
  getCatalogEntry,
  registerCatalogProcess,
  resetProcessCatalogForTests,
  resolveCatalogEntry,
} from './processCatalog';

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
});
