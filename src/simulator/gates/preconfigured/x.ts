import { createSingleQubitMatrixGate } from '../factories';
import { MATRIX_X } from '../matrices';

export const xGate = createSingleQubitMatrixGate({
  id: 'X',
  label: 'X',
  matrix: MATRIX_X,
  cssClass: 'gate-x',
  logMessage: (target) => `X flipped q${target}.`,
});
