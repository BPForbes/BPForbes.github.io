import type { GateDefinition } from '../types';
import { gateIoArity } from '../types';
import { applySwap } from '../operations';

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
  apply: ({ state, qubitCount, gate, measurements }) => {
    const [qubitA, qubitB] = gate.targets;
    return {
      state: applySwap(state, qubitCount, qubitA, qubitB),
      measurements,
      log: [`SWAP exchanged q${qubitA} and q${qubitB}.`],
    };
  },
};
