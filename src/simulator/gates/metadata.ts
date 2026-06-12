import { preconfiguredGates } from './preconfigured';

export const astPrimitiveGateIds = () =>
  preconfiguredGates.filter((gate) => gate.isAstPrimitive).map((gate) => gate.id);

export const astDerivedGateIds = () =>
  preconfiguredGates.filter((gate) => gate.isAstDerived).map((gate) => gate.id);

export const astGateInputCounts = (): Record<string, number> => {
  const counts: Record<string, number> = {};
  preconfiguredGates.forEach((gate) => {
    if (gate.isAstPrimitive || gate.isAstDerived) {
      counts[gate.id] = gate.ioArity.minInputs;
    }
  });
  return counts;
};

export const astGateOutputCounts = (): Record<string, number> => {
  const counts: Record<string, number> = {};
  preconfiguredGates.forEach((gate) => {
    if (gate.isAstPrimitive || gate.isAstDerived) {
      counts[gate.id] = gate.ioArity.minOutputs;
    }
  });
  return counts;
};
