import type { GateDefinition } from '../types';
import { gateIoArity } from '../types';
import { applyControlledZ } from '../operations';

export const czGate: GateDefinition = {
  id: 'CZ',
  category: 'preconfigured',
  label: 'CZ',
  controlKind: 'single',
  ioArity: gateIoArity(1, 1),
  astInputCount: 1,
  inPalette: true,
  isAstPrimitive: true,
  isAstDerived: false,
  supportsReverse: true,
  supportsPhase: false,
  cssClass: 'gate-cz',
  apply: ({ state, qubitCount, gate, measurements }) => {
    const target = gate.targets[0];
    return {
      state: applyControlledZ(state, qubitCount, gate.controls, target),
      measurements,
      log: [`CZ phased q${target} when q${gate.controls.join(', q')} were active.`],
    };
  },
};
