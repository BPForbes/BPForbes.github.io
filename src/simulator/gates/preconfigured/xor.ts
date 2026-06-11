import { createControlledXFamilyGate } from '../factories';

export const xorGate = createControlledXFamilyGate({
  id: 'XOR',
  label: 'XOR',
  cssClass: 'gate-xor',
  astInputCount: 2,
  controlKind: 'single',
  predicate: 'parity',
  isAstDerived: true,
});
