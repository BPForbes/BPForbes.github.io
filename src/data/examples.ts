import { CircuitGate } from '../simulator/types';

const gate = (id: string, type: CircuitGate['type'], step: number, targets: number[], controls: number[] = []): CircuitGate => ({
  id,
  type,
  step,
  targets,
  controls,
});

export type ExampleCircuit = {
  name: string;
  description: string;
  qubitCount: number;
  gates: CircuitGate[];
};

export const examples: ExampleCircuit[] = [
  {
    name: 'Bell state',
    description: 'Entangle q0 and q1 with H + CNOT, then measure both qubits.',
    qubitCount: 3,
    gates: [gate('bell-h', 'H', 0, [0]), gate('bell-cnot', 'CNOT', 1, [1], [0]), gate('bell-m0', 'MEASURE', 2, [0]), gate('bell-m1', 'MEASURE', 3, [1])],
  },
  {
    name: 'CNOT demo',
    description: 'Flip q0, then use it as a control to toggle q1.',
    qubitCount: 3,
    gates: [gate('cnot-x', 'X', 0, [0]), gate('cnot-gate', 'CNOT', 1, [1], [0]), gate('cnot-m0', 'MEASURE', 2, [0]), gate('cnot-m1', 'MEASURE', 3, [1])],
  },
  {
    name: 'CCNOT demo',
    description: 'Prepare q0 and q1 as 1, then Toffoli flips q2.',
    qubitCount: 3,
    gates: [gate('ccnot-x0', 'X', 0, [0]), gate('ccnot-x1', 'X', 1, [1]), gate('ccnot-gate', 'CCNOT', 2, [2], [0, 1]), gate('ccnot-m2', 'MEASURE', 3, [2])],
  },
];
