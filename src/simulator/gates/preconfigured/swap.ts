import type { GateDefinition } from '../types';
import { gateIoArity } from '../types';
import { applySwap } from '../operations';
// SWAP gate palette entry and apply hook for the shared registry.

export const swapGate: GateDefinition = {
  id: 'SWAP',
  category: 'preconfigured',
  label: 'SW',
  controlKind: 'swap',
  ioArity: gateIoArity(2, 2),
  astInputCount: 2,
  inPalette: true,
  isAstPrimitive: true,
  isAstDerived: false,
  supportsReverse: true,
  supportsPhase: false,
  cssClass: 'gate-swap',
  // apply hook wires simulator state through the shared operations layer.
  apply: ({ state, qubitCount, gate, measurements }) => {
    const [qubitA, qubitB] = gate.targets;
    return {
      state: applySwap(state, qubitCount, qubitA, qubitB),
      measurements,
      log: [`SWAP exchanged q${qubitA} and q${qubitB}.`],
    };
  },
};
