import { createControlledXFamilyGate } from '../factories';

export const orGate = createControlledXFamilyGate({
  id: 'OR',
  label: 'OR',
  cssClass: 'gate-or',
  astInputCount: 2,
  controlKind: 'single',
  predicate: 'any',
  isAstDerived: true,
});
