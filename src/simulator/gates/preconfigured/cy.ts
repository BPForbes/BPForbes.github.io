import type { GateDefinition } from '../types';
import { applyControlledSingleQubit } from '../operations';
import { MATRIX_Y } from '../matrices';

export const cyGate: GateDefinition = {
  id: 'CY',
  category: 'preconfigured',
  label: 'CY',
  controlKind: 'single',
  astInputCount: 1,
  inPalette: true,
  isAstPrimitive: true,
  isAstDerived: false,
  supportsReverse: true,
  supportsPhase: false,
  cssClass: 'gate-cy',
  apply: ({ state, qubitCount, gate, measurements }) => {
    const target = gate.targets[0];
    return {
      state: applyControlledSingleQubit(state, qubitCount, gate.controls, target, MATRIX_Y),
      measurements,
      log: [`CY applied Y on q${target} when q${gate.controls.join(', q')} were active.`],
    };
  },
};
