import { createSingleQubitMatrixGate } from '../factories';
import { MATRIX_X } from '../matrices';
// X gate palette entry and apply hook for the shared registry.

export const xGate = createSingleQubitMatrixGate({
  id: 'X',
  label: 'X',
  matrix: MATRIX_X,
  cssClass: 'gate-x',
  logMessage: (target) => `X flipped q${target}.`,
});
