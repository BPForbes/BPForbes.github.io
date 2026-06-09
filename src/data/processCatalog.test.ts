import { afterEach, describe, expect, it } from 'vitest';
import {
  getCatalogEntries,
  getCatalogEntry,
  registerCatalogProcess,
  resetProcessCatalogForTests,
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
});
