import { CircuitGate, GateType, QpuOperation } from './types';

export type ParsedCommand = {
  op: QpuOperation;
  raw: string;
  inputs: string[];
  outputs: string[];
  args: string[];
  phase?: number;
  reverse: boolean;
  noParameterSubstitution: boolean;
};

export type ProtocolProcess = {
  name: string;
  params: Array<{ name: string; type: string }>;
  lines: string[];
};

export type ProcessParam = {
  name: string;
  type: string;
  qubitIndex: number;
};

export type ReturnValue = {
  name: string;
  qubitIndex: number;
};

export type CompileResult = {
  gates: CircuitGate[];
  /** Physical registers used by the compiled circuit. */
  qubitCount: number;
  /** Ket width for RETURNVALS outputs when present, otherwise process parameter count. */
  logicalQubitCount: number;
  parsed: ParsedCommand[];
  log: string[];
  tokenMap: Record<string, number>;
  /** User-facing inputs from the PARAMS line only (excludes ancilla and reset targets). */
  processParams: ProcessParam[];
  /** Output registers from RETURNVALS; drive the displayed ket. */
  returnValues: ReturnValue[];
};

const primitiveGates = new Set(['X', 'H', 'CNOT', 'CCNOT', 'PHASE']);
const derivedGates = new Set(['NOT', 'AND', 'NAND', 'OR', 'XOR']);
const gateInputCounts: Partial<Record<QpuOperation, number>> = {
  X: 1,
  H: 1,
  PHASE: 1,
  CNOT: 1,
  CCNOT: 2,
  NOT: 1,
  AND: 2,
  NAND: 2,
  OR: 2,
  XOR: 2,
};

export const supportedQpuOperations: QpuOperation[] = [
  'INCREASECYCLE',
  'COMPILEPROCESS',
  'FREE',
  'SET',
  'JOIN',
  'SPLIT',
  'CALL',
  'DECLARECHILD',
  'RUNCHILD',
  'AND',
  'NAND',
  'OR',
  'NOT',
  'XOR',
  'MEASURE',
  'RETURNVALS',
  'ACCEPTVALS',
  'MASTERVAL',
  'SAVE_STATE',
  'LOAD_STATE',
  'MAIN-PROCESS',
  'CREATETOKEN',
  'DELETETOKEN',
  'X',
  'H',
  'CNOT',
  'CCNOT',
  'PHASE',
];

const stripCycle = (token: string) => token.replace(/^\$/, '').split(':')[0];
const isConstant = (token: string) => /^(0p|1p|sp)(?:_dim\d+)?$/i.test(token.replace(/^\$/, ''));

export const readProtocolLines = (source: string): string[] => {
  const joined: string[] = [];
  let buffer = '';

  source.replace(/\r\n/g, '\n').split('\n').forEach((raw) => {
    const line = raw.endsWith('\\') ? raw.slice(0, -1).trimEnd() : raw;
    if (raw.endsWith('\\')) {
      buffer += `${line} `;
      return;
    }
    joined.push(`${buffer}${line}`);
    buffer = '';
  });
  if (buffer.trim()) joined.push(buffer);

  let inBlockComment = false;
  return joined
    .map((raw) => {
      let line = raw.trim();
      if (!line) return '';
      if (inBlockComment) {
        if (!line.includes('*/')) return '';
        line = line.split('*/', 2)[1].trim();
        inBlockComment = false;
      }
      if (line.includes('/*')) {
        const [prefix, rest] = line.split('/*', 2);
        if (rest.includes('*/')) {
          line = `${prefix} ${rest.split('*/', 2)[1]}`.trim();
        } else {
          line = prefix.trim();
          inBlockComment = true;
        }
      }
      if (line.includes('#')) line = line.split('#', 1)[0].trim();
      return line;
    })
    .filter(Boolean);
};

export const parseParameters = (line: string): ProtocolProcess['params'] => {
  if (!line.toUpperCase().startsWith('PARAMS:')) return [];
  return line
    .slice(line.indexOf(':') + 1)
    .trim()
    .split(/\s+/)
    .filter((part) => part.includes(':'))
    .map((part) => {
      const [name, type] = part.split(':', 2);
      return { name, type };
    });
};

const splitFlagArgs = (tokens: string[], flag: '-I' | '-O') => {
  const upper = tokens.map((token) => token.toUpperCase());
  const start = upper.indexOf(flag);
  if (start === -1) return [];
  const end = upper.findIndex((token, index) => index > start && token.startsWith('-'));
  return tokens.slice(start + 1, end === -1 ? tokens.length : end);
};

export const parseCommand = (line: string): ParsedCommand => {
  let tokens = line.trim().split(/\s+/);
  if (!tokens.length) throw new Error('Empty command');
  if (tokens[0].endsWith('=') && tokens[1]) tokens = [`${tokens[0]}${tokens[1]}`, ...tokens.slice(2)];

  const rawOp = tokens[0];
  const upperTokens = tokens.map((token) => token.toUpperCase());
  const noParameterSubstitution = upperTokens.includes('-$R');
  let reverse = false;
  let normalized = rawOp.toUpperCase();
  let phase: number | undefined;

  if (normalized.startsWith('B')) {
    const candidate = normalized.slice(1).split('=', 1)[0];
    if (primitiveGates.has(candidate)) {
      reverse = true;
      normalized = normalized.slice(1);
    }
  }

  if (normalized.startsWith('BPHASE=')) {
    reverse = true;
    normalized = normalized.slice(1);
  }

  if (normalized.includes('=')) {
    const [gate, value] = normalized.split('=', 2);
    normalized = gate;
    phase = Number(value);
    if (!Number.isFinite(phase)) throw new Error(`Invalid ${gate} parameter '${value}'`);
    if (reverse && normalized === 'PHASE') phase *= -1;
  }

  const inputs = splitFlagArgs(tokens, '-I');
  const outputs = splitFlagArgs(tokens, '-O');
  const op = normalized as QpuOperation;

  if (!supportedQpuOperations.includes(op)) throw new Error(`Unknown command: ${normalized}`);
  if ((primitiveGates.has(op) || derivedGates.has(op)) && !inputs.length && op !== 'MEASURE') {
    throw new Error(`${op} requires -I inputs`);
  }
  if ((primitiveGates.has(op) || derivedGates.has(op)) && op !== 'MEASURE' && !outputs.length) {
    throw new Error(`${op} requires -O output`);
  }
  const expectedInputs = gateInputCounts[op];
  if (expectedInputs !== undefined && inputs.length < expectedInputs) {
    throw new Error(`${op} requires ${expectedInputs} input${expectedInputs === 1 ? '' : 's'}`);
  }

  return { op, raw: line, inputs, outputs, args: tokens.slice(1), phase, reverse, noParameterSubstitution };
};

export const parseProtocol = (source: string): ProtocolProcess => {
  const lines = readProtocolLines(source);
  const params = lines[0]?.toUpperCase().startsWith('PARAMS:') ? parseParameters(lines[0]) : [];
  const body = params.length ? lines.slice(1) : lines;
  const main = body.find((line) => line.toUpperCase().startsWith('MAIN-PROCESS '));
  return {
    name: main?.split(/\s+/)[1] ?? 'InlineProcess',
    params,
    lines: body,
  };
};

type Frame = {
  process: ProtocolProcess;
  scope: string;
  aliases: Map<string, string>;
  params: Map<string, string>;
};

type CompilerState = {
  gates: CircuitGate[];
  parsed: ParsedCommand[];
  log: string[];
  tokenToQubit: Map<string, number>;
  resetQubits: Set<number>;
  pendingCycleZeros: Set<number>;
  lastReturns: string[];
  currentCycle: number;
  processRuns: number;
  rootScope: string;
};

/** Gates shown in the circuit UI; cycle workspace prep is compiler-internal and never rendered. */
export const visibleCircuitGates = (gates: CircuitGate[]) => gates.filter((gate) => gate.type !== 'RESET');

const processLibraryFromSources = (sources: Record<string, string>) => {
  const library = new Map<string, ProtocolProcess>();
  Object.values(sources).forEach((source) => {
    const process = parseProtocol(source);
    library.set(process.name, process);
  });
  return library;
};

const sharedChildAncillaKey = (parentFrame: Frame) => `${parentFrame.scope}/@ancilla`;

const scopedName = (frame: Frame, token: string, parentFrame?: Frame) => {
  const base = stripCycle(token);
  if (frame.params.has(base)) return frame.params.get(base)!;
  if (frame.aliases.has(base)) return frame.aliases.get(base)!;
  if (isConstant(base)) return base.toLowerCase();
  if (parentFrame && /^\d+$/.test(base)) return sharedChildAncillaKey(parentFrame);
  return `${frame.scope}/${base}`;
};

const ensureQubit = (state: CompilerState, canonical: string) => {
  const key = isConstant(canonical) ? `const/${canonical.toLowerCase()}` : canonical;
  const existing = state.tokenToQubit.get(key);
  if (existing !== undefined) return existing;
  const next = state.tokenToQubit.size;
  state.tokenToQubit.set(key, next);
  if (key === 'const/1p') emitGate(state, 'X', [next], [], 'initialize constant 1p');
  if (key === 'const/sp') emitGate(state, 'H', [next], [], 'initialize superposition sp');
  return next;
};

const emitGate = (state: CompilerState, type: GateType, targets: number[], controls: number[], source: string, phase?: number) => {
  state.gates.push({
    id: `${type}-${state.gates.length}-${targets.join('-')}`,
    type,
    step: state.gates.length,
    targets,
    controls,
    phase,
    source,
  });
};

const scheduleCycleZero = (state: CompilerState, qubit: number) => {
  state.resetQubits.add(qubit);
  state.pendingCycleZeros.add(qubit);
};

const flushCycleZeros = (state: CompilerState, source: string) => {
  if (state.pendingCycleZeros.size === 0) return;
  const targets = [...state.pendingCycleZeros];
  state.pendingCycleZeros.clear();
  emitGate(state, 'RESET', targets, [], source);
};

const resolveInputQubit = (state: CompilerState, frame: Frame, token: string, parentFrame?: Frame) =>
  ensureQubit(state, scopedName(frame, token, parentFrame));

const returnRegistersForProcess = (process: ProtocolProcess): string[] => {
  for (const line of process.lines) {
    try {
      const command = parseCommand(line);
      if (command.op === 'RETURNVALS') return command.args.map(stripCycle);
    } catch {
      // Ignore malformed lines while scanning for the child's return register list.
    }
  }
  return [];
};

export const getReturnValTokens = (source: string): string[] => returnRegistersForProcess(parseProtocol(source));

export const getReturnValToken = (source: string, index: number): string => {
  const token = getReturnValTokens(source)[index];
  if (!token) throw new Error(`RETURNVALS index ${index} is out of range for this protocol`);
  return token;
};

const executeProcess = (
  process: ProtocolProcess,
  state: CompilerState,
  library: Map<string, ProtocolProcess>,
  passedParams: string[] = [],
  parentFrame?: Frame,
  outputBindings: Map<string, string> = new Map(),
): string[] => {
  const scope = `${process.name}#${state.processRuns}`;
  if (!state.rootScope) state.rootScope = scope;
  state.processRuns += 1;
  const params = new Map<string, string>();
  process.params.forEach((param, index) => {
    const provided = passedParams[index];
    let resolved: string;
    if (provided !== undefined && parentFrame) {
      resolved = scopedName(parentFrame, provided, parentFrame);
    } else {
      resolved = param.name;
    }
    params.set(param.name, resolved);
  });
  const frame: Frame = { process, scope, aliases: new Map(), params };
  outputBindings.forEach((parentToken, childRegister) => {
    frame.aliases.set(childRegister, parentToken);
  });
  process.params.forEach((param) => ensureQubit(state, params.get(param.name)!));
  let returns: string[] = [];

  state.log.push(`MAIN-PROCESS ${process.name} compiled in scope ${scope}.`);

  for (const line of process.lines) {
    const command = parseCommand(line);
    state.parsed.push(command);

    if (command.op === 'MAIN-PROCESS') {
      state.log.push(`Main process '${command.args[0]}' started.`);
      continue;
    }

    if (command.op === 'INCREASECYCLE') {
      flushCycleZeros(state, `INCREASECYCLE end of cycle ${state.currentCycle}`);
      state.currentCycle += 1;
      state.log.push(`Cycle increased to ${state.currentCycle}; workspace registers prepared for the new cycle.`);
      continue;
    }

    if (command.op === 'SET') {
      const [target, value] = command.args;
      const targetName = scopedName(frame, target, parentFrame);
      if (!value) throw new Error(`SET requires a value in '${line}'`);
      if (isConstant(value)) {
        const qubit = ensureQubit(state, targetName);
        const normalizedValue = value.replace(/^\$/, '').toLowerCase();
        if (normalizedValue.startsWith('0p')) scheduleCycleZero(state, qubit);
        if (normalizedValue.startsWith('1p')) emitGate(state, 'X', [qubit], [], line);
        if (normalizedValue.startsWith('sp')) emitGate(state, 'H', [qubit], [], line);
        state.log.push(`SET ${stripCycle(target)} to ${value} at cycle ${state.currentCycle}.`);
      } else {
        const valueName = scopedName(frame, value, parentFrame);
        frame.aliases.set(stripCycle(target), valueName);
        state.log.push(`SET ${stripCycle(target)} as alias of ${stripCycle(value)}.`);
      }
      continue;
    }

    if (command.op === 'CREATETOKEN') {
      command.inputs.forEach((token) => {
        ensureQubit(state, scopedName(frame, token, parentFrame));
      });
      state.log.push(`CREATETOKEN created ${command.inputs.join(', ')}.`);
      continue;
    }

    if (command.op === 'DELETETOKEN' || command.op === 'FREE') {
      state.log.push(`${command.op} acknowledged for ${command.inputs.join(', ')}.`);
      continue;
    }

    if (command.op === 'DECLARECHILD') {
      state.log.push(`Declared child '${command.args[0]}'.`);
      continue;
    }

    if (command.op === 'RUNCHILD' || command.op === 'CALL') {
      const childName = command.op === 'RUNCHILD' ? command.args[0] : command.args[0];
      const child = library.get(childName);
      if (!child) throw new Error(`Unknown child process '${childName}'`);
      const childReturnRegisters = returnRegistersForProcess(child);
      const childOutputBindings = new Map<string, string>();
      const preparedOutputQubits = new Set<number>();
      command.outputs.forEach((output, index) => {
        const childRegister = childReturnRegisters[index];
        if (!childRegister) return;
        const parentToken = scopedName(frame, stripCycle(output), parentFrame);
        const qubit = ensureQubit(state, parentToken);
        if (!preparedOutputQubits.has(qubit)) {
          preparedOutputQubits.add(qubit);
          scheduleCycleZero(state, qubit);
        }
        childOutputBindings.set(childRegister, parentToken);
      });
      flushCycleZeros(state, `prepare outputs before RUNCHILD ${childName} at cycle ${state.currentCycle}`);
      const childReturns = executeProcess(child, state, library, command.inputs, frame, childOutputBindings);
      command.outputs.forEach((output, index) => {
        const returned = childReturns[index];
        if (returned) frame.aliases.set(stripCycle(output), returned);
      });
      state.lastReturns = childReturns;
      state.log.push(`${command.op} ${childName} returned ${childReturns.length} value(s).`);
      continue;
    }

    if (command.op === 'ACCEPTVALS') {
      command.args.forEach((local, index) => {
        const returned = state.lastReturns[index];
        if (returned) frame.aliases.set(stripCycle(local), returned);
      });
      state.log.push(`ACCEPTVALS ${command.args.join(', ')}.`);
      continue;
    }

    if (command.op === 'RETURNVALS') {
      returns = command.args.map((token) => scopedName(frame, token, parentFrame));
      state.log.push(`RETURNVALS ${command.args.join(', ')}.`);
      continue;
    }

    if (command.op === 'MEASURE') {
      if (command.inputs.length) {
        command.inputs.forEach((token) => emitGate(state, 'MEASURE', [resolveInputQubit(state, frame, token, parentFrame)], [], line));
      } else {
        state.tokenToQubit.forEach((qubit) => emitGate(state, 'MEASURE', [qubit], [], line));
      }
      continue;
    }

    if (command.op === 'SAVE_STATE' || command.op === 'LOAD_STATE' || command.op === 'MASTERVAL' || command.op === 'COMPILEPROCESS') {
      state.log.push(`${command.op} parsed: ${command.args.join(' ')}.`);
      continue;
    }

    if (command.op === 'JOIN' || command.op === 'SPLIT') {
      state.log.push(`${command.op} parsed for register memory; visual lowering is deferred.`);
      continue;
    }

    if (primitiveGates.has(command.op)) {
      flushCycleZeros(state, `prepare workspace before gate at cycle ${state.currentCycle}`);
      const targetToken = command.outputs[0] ?? command.inputs[0];
      const target = resolveInputQubit(state, frame, targetToken, parentFrame);
      const controls = command.inputs
        .map((input) => resolveInputQubit(state, frame, input, parentFrame))
        .filter((qubit) => qubit !== target);
      emitGate(state, command.op as GateType, [target], controls, line, command.op === 'PHASE' ? command.phase ?? 0 : undefined);
      continue;
    }

    if (derivedGates.has(command.op)) {
      flushCycleZeros(state, `prepare workspace before gate at cycle ${state.currentCycle}`);
      const target = resolveInputQubit(state, frame, command.outputs[0], parentFrame);
      const controls = command.inputs
        .map((input) => resolveInputQubit(state, frame, input, parentFrame))
        .filter((qubit) => qubit !== target);
      emitGate(state, command.op as GateType, [target], controls, line);
      continue;
    }
  }

  flushCycleZeros(state, `end of process ${process.name}`);
  return returns;
};

const compactQubitLayout = (
  gates: CircuitGate[],
  tokenMap: Record<string, number>,
  processParams: ProcessParam[],
) => {
  const used = new Set<number>();
  gates.forEach((gate) => {
    gate.targets.forEach((qubit) => used.add(qubit));
    gate.controls.forEach((qubit) => used.add(qubit));
  });
  processParams.forEach((param) => used.add(param.qubitIndex));

  const sorted = [...used].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { gates, tokenMap, processParams, qubitCount: 1 };
  }

  const remap = new Map(sorted.map((old, index) => [old, index]));
  return {
    gates: gates.map((gate) => ({
      ...gate,
      targets: gate.targets.map((qubit) => remap.get(qubit)!),
      controls: gate.controls.map((qubit) => remap.get(qubit)!),
    })),
    tokenMap: Object.fromEntries(
      Object.entries(tokenMap).flatMap(([token, qubit]) => {
        const mapped = remap.get(qubit);
        return mapped === undefined ? [] : [[token, mapped]];
      }),
    ),
    processParams: processParams.map((param) => ({
      ...param,
      qubitIndex: remap.get(param.qubitIndex)!,
    })),
    qubitCount: sorted.length,
  };
};

export const compileQpuProtocol = (source: string, librarySources: Record<string, string> = {}): CompileResult => {
  const main = parseProtocol(source);
  const library = processLibraryFromSources(librarySources);
  library.set(main.name, main);
  const state: CompilerState = {
    gates: [],
    parsed: [],
    log: [],
    tokenToQubit: new Map(),
    resetQubits: new Set(),
    pendingCycleZeros: new Set(),
    lastReturns: [],
    currentCycle: 0,
    processRuns: 0,
    rootScope: '',
  };

  executeProcess(main, state, library);

  const tokenMap: Record<string, number> = {};
  state.tokenToQubit.forEach((qubit, token) => {
    tokenMap[token] = qubit;
  });

  const processParams: ProcessParam[] = main.params.flatMap((param) => {
    const qubitIndex = tokenMap[param.name];
    if (qubitIndex === undefined) return [];
    if (state.resetQubits.has(qubitIndex)) return [];
    if (param.type === 'int') return [];
    return [{ name: param.name, type: param.type, qubitIndex }];
  });

  const compacted = compactQubitLayout(
    state.gates.map((gate, step) => ({ ...gate, step })),
    tokenMap,
    processParams,
  );

  const returnValues: ReturnValue[] = returnRegistersForProcess(main).flatMap((name) => {
    const entry = Object.entries(compacted.tokenMap).find(([token]) => token === name || token.endsWith(`/${name}`));
    if (entry === undefined) return [];
    return [{ name, qubitIndex: entry[1] }];
  });

  return {
    gates: compacted.gates,
    qubitCount: compacted.qubitCount,
    logicalQubitCount: returnValues.length > 0 ? returnValues.length : compacted.processParams.length > 0
      ? compacted.processParams.length
      : compacted.qubitCount,
    parsed: state.parsed,
    log: state.log,
    tokenMap: compacted.tokenMap,
    processParams: compacted.processParams,
    returnValues,
  };
};
