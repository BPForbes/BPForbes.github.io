import { createControlledXFamilyGate } from '../factories';
// XOR gate palette entry and apply hook for the shared registry.

export const xorGate = createControlledXFamilyGate({
  id: 'XOR',
  label: 'XOR',
  cssClass: 'gate-xor',
  astInputCount: 2,
  controlKind: 'single',
  predicate: 'parity',
  isAstDerived: true,
});
