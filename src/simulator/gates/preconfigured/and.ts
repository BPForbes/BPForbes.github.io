/**
 * Derived logical AND gate implemented through the controlled-X family used by protocol AST commands.
 */
import { createControlledXFamilyGate } from '../factories';

export const andGate = createControlledXFamilyGate({
  id: 'AND',
  label: 'AND',
  cssClass: 'gate-and',
  astInputCount: 2,
  controlKind: 'single',
  isAstDerived: true,
});
