import { createFixedPhaseGate } from '../factories';
import { PHASE_PI_4 } from '../matrices';

export const tGate = createFixedPhaseGate({
  id: 'T',
  label: 'T',
  angle: PHASE_PI_4,
  cssClass: 'gate-t',
});
