import { CircuitGate, ParticleStartState } from './types';

export type ProtocolParamEntry = { name: string; type: string };

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

const stripProtocolRef = (token: string) => token.replace(/^\$/, '').split(':')[0];
const isMainProcessLine = (line: string) => /^\s*MAIN-PROCESS\s+/i.test(line);
const isParamsLine = (line: string) => /^\s*PARAMS:/i.test(line);
const isSetLine = (line: string) => /^\s*SET\s+/i.test(line);
const paramsLineIndex = (lines: string[]) => lines.findIndex(isParamsLine);

const parseProtocolParamParts = (paramsBody: string): ProtocolParamEntry[] => paramsBody
  .trim()
  .split(/\s+/)
  .filter((part) => part.includes(':'))
  .map((part) => {
    const [name, type] = part.split(':', 2);
    return { name, type: type || 'state' };
  });

export const getProtocolParameterEntries = (source: string): ProtocolParamEntry[] => {
  const line = source.replace(/\r\n/g, '\n').split('\n').find(isParamsLine);
  if (!line) return [];
  return parseProtocolParamParts(line.slice(line.indexOf(':') + 1));
};

const reservedProtocolNames = (source: string) => new Set(
  Array.from(source.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g), ([name]) => name)
    .filter((name) => !['PARAMS', 'MAIN', 'PROCESS', 'state', 'int', 'float'].includes(name)),
);

const nextProtocolParamName = (reserved: Set<string>, index: number) => {
  for (let candidateIndex = index; ; candidateIndex += 1) {
    const candidate = `Q${candidateIndex}`;
    if (!reserved.has(candidate)) {
      reserved.add(candidate);
      return candidate;
    }
  }
};

export const updateProtocolParameterCount = (source: string, paramCount: number) => {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const lineIndex = paramsLineIndex(lines);
  const currentParams = lineIndex >= 0
    ? parseProtocolParamParts(lines[lineIndex].slice(lines[lineIndex].indexOf(':') + 1))
    : [];
  const reservedNames = reservedProtocolNames(source);
  currentParams.forEach((param) => reservedNames.add(param.name));
  const nextParams = currentParams.slice(0, Math.max(0, paramCount));

  while (nextParams.length < paramCount) {
    nextParams.push({ name: nextProtocolParamName(reservedNames, nextParams.length), type: 'state' });
  }

  const paramsLine = `PARAMS: ${nextParams.map((param) => `${param.name}:${param.type}`).join(' ')}`.trimEnd();
  if (lineIndex >= 0) {
    lines[lineIndex] = `${lines[lineIndex].match(/^\s*/)?.[0] ?? ''}${paramsLine}`;
  } else {
    lines.unshift(paramsLine, '');
  }

  return lines.join(newline);
};

export const updateProtocolStartStateSet = (source: string, paramName: string, startState: ParticleStartState) => {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let updated = false;

  const nextLines = lines.map((line) => {
    if (!isSetLine(line)) return line;
    const indent = line.match(/^\s*/)?.[0] ?? '';
    const commentMatch = line.match(/(\s+#.*)$/);
    const comment = commentMatch?.[1] ?? '';
    const body = commentMatch ? line.slice(0, -comment.length) : line;
    const parts = body.trim().split(/\s+/);
    const [, target, value] = parts;
    if (!target || !value) return line;
    if (stripProtocolRef(target) !== paramName && stripProtocolRef(value) !== paramName) return line;
    updated = true;
    return `${indent}SET ${target} ${startState}${comment}`;
  });

  if (!updated) {
    const mainIndex = nextLines.findIndex(isMainProcessLine);
    const paramsIndex = nextLines.findIndex(isParamsLine);
    const insertAt = mainIndex >= 0 ? mainIndex + 1 : paramsIndex >= 0 ? paramsIndex + 1 : 0;
    nextLines.splice(insertAt, 0, `SET $${paramName} ${startState}`);
  }

  return nextLines.join(newline);
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
      if (gate.type === 'RESET') {
        gate.targets.forEach((qubit) => {
          lines.push(`SET ${canvasParamRef(qubit)} 0p`);
        });
        return;
      }

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
