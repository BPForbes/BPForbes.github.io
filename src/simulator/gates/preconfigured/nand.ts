import { createControlledXFamilyGate } from '../factories';
// NAND gate palette entry and apply hook for the shared registry.

export const nandGate = createControlledXFamilyGate({
  id: 'NAND',
  label: 'NAND',
  cssClass: 'gate-nand',
  astInputCount: 2,
  controlKind: 'single',
  invertTarget: true,
  isAstDerived: true,
});
