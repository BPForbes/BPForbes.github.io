import { createFixedPhaseGate } from '../factories';
import { PHASE_PI } from '../matrices';
// Z gate palette entry and apply hook for the shared registry.

export const zGate = createFixedPhaseGate({
  id: 'Z',
  label: 'Z',
  angle: PHASE_PI,
  cssClass: 'gate-z',
});
