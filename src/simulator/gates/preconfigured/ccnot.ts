import { createControlledXFamilyGate } from '../factories';

export const ccnotGate = createControlledXFamilyGate({
  id: 'CCNOT',
  label: 'CCX',
  cssClass: 'gate-ccnot',
  astInputCount: 2,
  controlKind: 'double',
});
