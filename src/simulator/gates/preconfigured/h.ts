import { createSingleQubitMatrixGate } from '../factories';
import { MATRIX_H } from '../matrices';
// H gate palette entry and apply hook for the shared registry.

export const hGate = createSingleQubitMatrixGate({
  id: 'H',
  label: 'H',
  matrix: MATRIX_H,
  cssClass: 'gate-h',
  logMessage: (target) => `H put q${target} into superposition.`,
});
