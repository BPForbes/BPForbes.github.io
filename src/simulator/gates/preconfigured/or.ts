/**
 * Derived OR gate uses the controlled-X family to express classical OR behavior in protocol examples.
 */
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
