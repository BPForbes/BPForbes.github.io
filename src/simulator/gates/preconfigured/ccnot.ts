import { createControlledXFamilyGate } from '../factories';
// CCNOT gate palette entry and apply hook for the shared registry.

export const ccnotGate = createControlledXFamilyGate({
  id: 'CCNOT',
  label: 'CCX',
  cssClass: 'gate-ccnot',
  astInputCount: 2,
  controlKind: 'double',
});
