import { createControlledXFamilyGate } from '../factories';
// CNOT gate palette entry and apply hook for the shared registry.

export const cnotGate = createControlledXFamilyGate({
  id: 'CNOT',
  label: 'CX',
  cssClass: 'gate-cnot',
  astInputCount: 1,
  controlKind: 'single',
});
