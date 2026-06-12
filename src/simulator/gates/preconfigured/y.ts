import { createSingleQubitMatrixGate } from '../factories';
import { MATRIX_Y } from '../matrices';

export const yGate = createSingleQubitMatrixGate({
  id: 'Y',
  label: 'Y',
  matrix: MATRIX_Y,
  cssClass: 'gate-y',
  logMessage: (target) => `Y rotated q${target} around the Y axis.`,
});
