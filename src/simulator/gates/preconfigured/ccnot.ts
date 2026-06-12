/**
 * Toffoli/CCNOT gate definition, the reversible primitive behind several derived logical operations.
 */
import { createControlledXFamilyGate } from '../factories';

export const ccnotGate = createControlledXFamilyGate({
  id: 'CCNOT',
  label: 'CCX',
  cssClass: 'gate-ccnot',
  astInputCount: 2,
  controlKind: 'double',
});
