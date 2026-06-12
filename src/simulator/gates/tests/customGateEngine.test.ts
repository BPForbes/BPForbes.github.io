import { beforeEach, describe, expect, it, vi } from 'vitest';
import { magnitudeSquared } from '../../complex';
import { createInitialState } from '../../engine';
import type { CircuitGate } from '../types';
import {
  applyCustomGateProcess,
  getCustomGateRecord,
  listCustomGateRecords,
  registerCustomGate,
  removeCustomGateRecord,
} from '../customGateEngine';

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

// Case: registers and retrieves a custom gate record.
  it('registers and retrieves a custom gate record', () => {
    const record = registerCustomGate({ id: 'MyGate', source: validSource });
    expect(record.id).toBe('MyGate');
    expect(record.source).toBe(validSource);
    expect(getCustomGateRecord('MyGate')?.source).toBe(validSource);
    expect(listCustomGateRecords()).toHaveLength(1);
  });

// Case: executes custom gates with RETURNVALS mapped onto gate targets.
  it('executes custom gates with RETURNVALS mapped onto gate targets', () => {
    const record = registerCustomGate({
      id: 'Macro',
      source: 'PARAMS: Q0:1\nMAIN-PROCESS Macro\nH -I Q0:0 -O Q0:0\nRETURNVALS Q0',
    });
    const gate: CircuitGate = { id: 'macro-0', type: 'Macro', step: 0, targets: [0], controls: [1] };
    const initial = createInitialState(2);
    expect(magnitudeSquared(initial[2])).toBeCloseTo(0, 10);
    expect(magnitudeSquared(initial[3])).toBeCloseTo(0, 10);
    expect(magnitudeSquared(initial[1])).toBeCloseTo(0, 10);

    const result = applyCustomGateProcess(initial, 2, gate, {}, record);

    expect(result.log.some((entry) => /executing/i.test(entry))).toBe(true);
    expect(magnitudeSquared(result.state[2])).toBeGreaterThan(0.1);
    expect(magnitudeSquared(result.state[3])).toBeCloseTo(0, 10);
    expect(magnitudeSquared(result.state[1])).toBeCloseTo(0, 10);
  });

// Case: re-registers the same custom id by replacing the stored record.
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
