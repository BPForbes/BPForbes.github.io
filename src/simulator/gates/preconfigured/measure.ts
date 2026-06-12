import type { GateDefinition } from '../types';
import { gateIoArity } from '../types';
import { measureQubit } from '../operations';
// MEASURE gate palette entry and apply hook for the shared registry.

export const measureGate: GateDefinition = {
  id: 'MEASURE',
  category: 'preconfigured',
  label: 'M',
  controlKind: 'none',
  ioArity: gateIoArity(0, 0, 1, 0),
  astInputCount: 0,
  inPalette: true,
  isAstPrimitive: true,
  isAstDerived: false,
  supportsReverse: false,
  supportsPhase: false,
  cssClass: 'gate-measure',
  // apply hook wires simulator state through the shared operations layer.
  apply: ({ state, qubitCount, gate, measurements }) => {
    const target = gate.targets[0];
    const measured = measureQubit(state, qubitCount, target);
    return {
      state: measured.state,
      measurements: { ...measurements, [target]: measured.value },
      log: [`Measured q${target} = ${measured.value} (P(1)=${measured.probabilityOne.toFixed(3)}).`],
    };
  },
};
