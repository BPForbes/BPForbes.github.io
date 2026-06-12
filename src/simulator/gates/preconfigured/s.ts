import { createFixedPhaseGate } from '../factories';
import { PHASE_PI_2 } from '../matrices';
// S gate palette entry and apply hook for the shared registry.

export const sGate = createFixedPhaseGate({
  id: 'S',
  label: 'S',
  angle: PHASE_PI_2,
  cssClass: 'gate-s',
});
