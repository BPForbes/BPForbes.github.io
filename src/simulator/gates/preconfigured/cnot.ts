/**
 * Controlled-NOT gate definition used by both canvas placement and compiled protocol instructions.
 */
import { createControlledXFamilyGate } from '../factories';

export const cnotGate = createControlledXFamilyGate({
  id: 'CNOT',
  label: 'CX',
  cssClass: 'gate-cnot',
  astInputCount: 1,
  controlKind: 'single',
});
