import { CircuitGate, ParticleStartState } from './types';

const sanitizeProcessName = (name: string) => {
  const cleaned = name.replace(/[^A-Za-z0-9_]+/g, ' ').trim().replace(/\s+(\w)/g, (_, letter: string) => letter.toUpperCase());
  return cleaned.replace(/^[^A-Za-z_]+/, '') || 'CircuitProcess';
};

export const extractMainProcessName = (source: string): string | null => {
  const line = source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => /^MAIN-PROCESS\s+/i.test(candidate));
  return line?.split(/\s+/)[1] ?? null;
};

export const qpucirFileNameForSource = (source: string, fallbackName = 'CurrentCircuit') => {
  const processName = sanitizeProcessName(extractMainProcessName(source) ?? fallbackName);
  return `${processName}.qpucir`;
};

const canvasParamRef = (qubit: number) => `$Q${qubit}`;

export const serializeCircuitToQpuProtocol = (
  gates: CircuitGate[],
  qubitCount: number,
  startStates: ParticleStartState[] = [],
  processName = 'CanvasCircuit',
) => {
  const lines = [
    `PARAMS: ${Array.from({ length: qubitCount }, (_, qubit) => `Q${qubit}:1`).join(' ')}`,
    '',
    `MAIN-PROCESS ${sanitizeProcessName(processName)}`,
  ];

  Array.from({ length: qubitCount }, (_, qubit) => {
    const startState = startStates[qubit] ?? '0p';
    if (startState !== '0p') {
      lines.push(`SET ${canvasParamRef(qubit)} ${startState}`);
    }
  });

  gates
    .slice()
    .sort((a, b) => a.step - b.step)
    .forEach((gate) => {
      if (gate.type === 'RESET') return;

      const target = `${canvasParamRef(gate.targets[0])}:0`;
      const controls = gate.controls.map((control) => `${canvasParamRef(control)}:0`);
      if (gate.type === 'MEASURE') {
        lines.push(`MEASURE -I ${canvasParamRef(gate.targets[0])}`);
        return;
      }
      if (gate.type === 'X' || gate.type === 'H' || gate.type === 'PHASE' || gate.type === 'NOT') {
        const op = gate.type === 'PHASE' ? `PHASE=${gate.phase ?? 0}` : gate.type;
        lines.push(`${op} -I ${target} -O ${target}`);
        return;
      }
      lines.push(`${gate.type} -I ${controls.join(' ')} -O ${target}`);
    });

  lines.push(`RETURNVALS ${Array.from({ length: qubitCount }, (_, qubit) => canvasParamRef(qubit)).join(' ')}`);
  return lines.join('\n');
};
