import { describe, expect, it } from 'vitest';
import { registerCustomGate } from './customGateEngine';

describe('customGateEngine', () => {
  it('rejects custom gate ids that shadow preconfigured gates', () => {
    expect(() => registerCustomGate({
      id: 'CNOT',
      source: 'MAIN-PROCESS Shadow\nRETURNVALS Q0',
    })).toThrow(/conflicts with preconfigured gate/i);
  });
});
