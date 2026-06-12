/**
 * Derived NAND gate shares AND wiring but inverts the target to model NAND truth-table semantics.
 */
import { createControlledXFamilyGate } from '../factories';

export const nandGate = createControlledXFamilyGate({
  id: 'NAND',
  label: 'NAND',
  cssClass: 'gate-nand',
  astInputCount: 2,
  controlKind: 'single',
  invertTarget: true,
  isAstDerived: true,
});
