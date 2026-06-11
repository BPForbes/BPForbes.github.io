import { createControlledXFamilyGate } from '../factories';

export const andGate = createControlledXFamilyGate({
  id: 'AND',
  label: 'AND',
  cssClass: 'gate-and',
  astInputCount: 2,
  controlKind: 'single',
  isAstDerived: true,
});
