/**
 * S gate applies the standard quarter-turn phase rotation.
 */
import { createFixedPhaseGate } from '../factories';
import { PHASE_PI_2 } from '../matrices';

export const sGate = createFixedPhaseGate({
  id: 'S',
  label: 'S',
  angle: PHASE_PI_2,
  cssClass: 'gate-s',
});
