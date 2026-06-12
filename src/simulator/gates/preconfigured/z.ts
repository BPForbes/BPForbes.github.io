import { createFixedPhaseGate } from '../factories';
import { PHASE_PI } from '../matrices';

export const zGate = createFixedPhaseGate({
  id: 'Z',
  label: 'Z',
  angle: PHASE_PI,
  cssClass: 'gate-z',
});
