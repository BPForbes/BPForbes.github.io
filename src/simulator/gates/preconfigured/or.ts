import { createControlledXFamilyGate } from '../factories';
// OR gate palette entry and apply hook for the shared registry.

export const orGate = createControlledXFamilyGate({
  id: 'OR',
  label: 'OR',
  cssClass: 'gate-or',
  astInputCount: 2,
  controlKind: 'single',
  predicate: 'any',
  isAstDerived: true,
});
