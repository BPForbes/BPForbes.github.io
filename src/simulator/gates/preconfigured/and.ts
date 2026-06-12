import { createControlledXFamilyGate } from '../factories';
// AND gate palette entry and apply hook for the shared registry.

export const andGate = createControlledXFamilyGate({
  id: 'AND',
  label: 'AND',
  cssClass: 'gate-and',
  astInputCount: 2,
  controlKind: 'single',
  isAstDerived: true,
});
