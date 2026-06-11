import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCustomGateRecord,
  listCustomGateRecords,
  registerCustomGate,
  removeCustomGateRecord,
} from './customGateEngine';

const validSource = 'MAIN-PROCESS TestGate\nRETURNVALS Q0';

describe('customGateEngine', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', {
      storage: {} as Record<string, string>,
      setItem(key: string, value: string) {
        this.storage[key] = value;
      },
      getItem(key: string) {
        return this.storage[key] ?? null;
      },
      removeItem(key: string) {
        delete this.storage[key];
      },
    });
  });

  it('rejects custom gate ids that shadow preconfigured gates', () => {
    expect(() => registerCustomGate({
      id: 'CNOT',
      source: validSource,
    })).toThrow(/conflicts with preconfigured gate/i);
  });

  it('rejects case-insensitive conflicts with preconfigured gates', () => {
    expect(() => registerCustomGate({
      id: 'cnot',
      source: validSource,
    })).toThrow(/conflicts with preconfigured gate/i);
  });

  it('rejects invalid custom gate id format', () => {
    expect(() => registerCustomGate({
      id: '1GATE',
      source: validSource,
    })).toThrow(/must start with a letter/i);
  });

  it('registers and retrieves a custom gate record', () => {
    const record = registerCustomGate({ id: 'MyGate', source: validSource });
    expect(record.id).toBe('MyGate');
    expect(record.source).toBe(validSource);
    expect(getCustomGateRecord('MyGate')?.source).toBe(validSource);
    expect(listCustomGateRecords()).toHaveLength(1);
  });

  it('re-registers the same custom id by replacing the stored record', () => {
    const updatedSource = 'MAIN-PROCESS TestGate\nRETURNVALS Q0\nRETURNVALS Q1';
    registerCustomGate({ id: 'MyGate', source: validSource });
    const updated = registerCustomGate({ id: 'MyGate', source: updatedSource });
    expect(updated.source).toBe(updatedSource);
    expect(listCustomGateRecords()).toHaveLength(1);
    expect(getCustomGateRecord('mygate')?.source).toBe(updatedSource);
    removeCustomGateRecord('MyGate');
  });
});
