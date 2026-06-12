import type { GateDefinition } from '../types';
import { gateIoArity } from '../types';
import { applySingleQubitGate } from '../operations';
import { phaseMatrix } from '../matrices';
// PHASE gate palette entry and apply hook for the shared registry.

export const phaseGate: GateDefinition = {
  id: 'PHASE',
  category: 'preconfigured',
  label: 'P',
  controlKind: 'none',
  ioArity: gateIoArity(1, 1),
  astInputCount: 1,
  inPalette: true,
  isAstPrimitive: true,
  isAstDerived: false,
  supportsReverse: true,
  supportsPhase: true,
  cssClass: 'gate-phase',
  // apply hook wires simulator state through the shared operations layer.
  apply: ({ state, qubitCount, gate, measurements }) => {
    const target = gate.targets[0];
    const angle = gate.phase ?? 0;
    return {
      state: applySingleQubitGate(state, qubitCount, target, phaseMatrix(angle)),
      measurements,
      log: [`PHASE(${angle.toFixed(3)}) rotated q${target}.`],
    };
  },
};
