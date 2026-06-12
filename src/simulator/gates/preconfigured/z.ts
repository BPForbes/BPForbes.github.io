/**
 * Pauli-Z gate preserves population while flipping the phase of the one state.
 */
import { createFixedPhaseGate } from '../factories';
import { PHASE_PI } from '../matrices';

export const zGate = createFixedPhaseGate({
  id: 'Z',
  label: 'Z',
  angle: PHASE_PI,
  cssClass: 'gate-z',
});
