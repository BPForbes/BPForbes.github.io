/**
 * Natural-language wire resolver for correction requests.
 *
 * Users often refer to registers by names, aliases, or partial addresses. This
 * module turns those phrases into concrete protocol wire addresses or explicit
 * clarification prompts when a safe single target cannot be inferred.
 */
import type { NlCorrectionContext } from './nlIntentTypes';

const stripRef = (token: string) => token.replace(/^\$/, '').split(':')[0].trim();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const tokenExistsInSource = (token: string, source: string) => (
  new RegExp(`\\b${escapeRegex(token)}\\b`).test(source)
);

const wireForRegister = (register: string, source: string): string | null => {
  const match = source.match(new RegExp(`SET\\s+(\\S+)\\s+\\$${escapeRegex(register)}\\b`, 'i'));
  return match?.[1] ?? null;
};

const registerForAddress = (address: string, context: NlCorrectionContext): string | null => {
  const base = stripRef(address.replace(/^\$/, ''));
  return [...context.inputColumns, ...context.outputColumns]
    .find((column) => column.toLowerCase() === base.toLowerCase())
    ?? null;
};

const canonicalWireKey = (address: string, context: NlCorrectionContext): string => {
  const bare = address.replace(/^\$/, '');
  const register = registerForAddress(address, context);
  if (register) return `reg:${register.toLowerCase()}`;
  if (/^\d+:\d+$/.test(bare)) return `wire:${bare}`;
  if (/^[\w]+:\d+$/.test(bare)) return `wire:${bare}`;
  const wire = wireForRegister(stripRef(bare), context.source);
  if (wire) return `wire:${wire}`;
  return `name:${stripRef(bare).toLowerCase()}`;
};

const dedupeByCanonical = (candidates: string[], context: NlCorrectionContext): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  candidates.forEach((candidate) => {
    const key = canonicalWireKey(candidate, context);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(candidate);
  });
  return unique;
};

export const formatAddressLabel = (address: string, context: NlCorrectionContext): string => {
  if (/^\d+:\d+$/.test(address)) {
    const param = context.source.match(new RegExp(`SET\\s+${escapeRegex(address)}\\s+(\\$\\w+)`, 'i'));
    return param ? `${address} (${param[1]})` : address;
  }
  if (/^[\w]+:\d+$/.test(address)) {
    const param = context.source.match(new RegExp(`SET\\s+${escapeRegex(address)}\\s+(\\$\\w+)`, 'i'));
    if (param) return `${address} (${param[1]})`;
    const base = stripRef(address);
    if (context.inputColumns.includes(base) || context.outputColumns.includes(base)) {
      return `${address} (register ${base})`;
    }
  }
  const wire = wireForRegister(stripRef(address), context.source);
  if (wire) {
    const param = context.source.match(new RegExp(`SET\\s+${escapeRegex(wire)}\\s+(\\$\\w+)`, 'i'));
    return param ? `${address} → ${wire} (${param[1]})` : `${address} → ${wire}`;
  }
  return address;
};

export const getAddressCandidates = (name: string, context: NlCorrectionContext): string[] => {
  const candidates: string[] = [];
  const add = (value: string) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  const raw = name.trim();
  const bare = raw.replace(/^\$/, '');
  const base = stripRef(bare);

  if ((/^[\w]+:\d+$/.test(bare) || /^\d+:\d+$/.test(bare)) && tokenExistsInSource(bare, context.source)) {
    add(bare);
  }

  [...context.inputColumns, ...context.outputColumns].forEach((column) => {
    if (column.toLowerCase() === base.toLowerCase()) add(column);
  });

  const setParamPattern = new RegExp(`SET\\s+(\\S+)\\s+\\$${escapeRegex(base)}\\b`, 'gi');
  let setMatch = setParamPattern.exec(context.source);
  while (setMatch) {
    add(setMatch[1]);
    setMatch = setParamPattern.exec(context.source);
  }

  const namedBitPattern = new RegExp(`\\b(${escapeRegex(base)}:\\d+)\\b`, 'gi');
  setMatch = namedBitPattern.exec(context.source);
  while (setMatch) {
    add(setMatch[1]);
    setMatch = namedBitPattern.exec(context.source);
  }

  if (/^\d+$/.test(base)) {
    const wirePattern = new RegExp(`SET\\s+(${escapeRegex(base)}:\\d+)\\s+\\$\\w+`, 'gi');
    setMatch = wirePattern.exec(context.source);
    while (setMatch) {
      add(setMatch[1]);
      setMatch = wirePattern.exec(context.source);
    }
  }

  return candidates;
};

export type WireAddressResolution =
  | { status: 'resolved'; address: string }
  | { status: 'clarify'; token: string; prompt: string; candidates: string[] };

export const resolveWireAddress = (name: string, context: NlCorrectionContext): WireAddressResolution => {
  const raw = name.trim();
  const bare = raw.replace(/^\$/, '');
  const base = stripRef(bare);
  const requestedBit = bare.includes(':') ? Number(bare.split(':')[1]) : null;

  if ((/^[\w]+:\d+$/.test(bare) || /^\d+:\d+$/.test(bare)) && tokenExistsInSource(bare, context.source)) {
    return { status: 'resolved', address: bare };
  }

  const candidates = getAddressCandidates(name, context);
  const wireCandidates = candidates.filter((candidate) => (
    /^\d+:\d+$/.test(candidate) || /^[\w]+:\d+$/.test(candidate)
  ));

  if (requestedBit !== null && !Number.isNaN(requestedBit)) {
    const literal = `${base}:${requestedBit}`;
    if (!tokenExistsInSource(literal, context.source) && wireCandidates.length > 0) {
      return {
        status: 'clarify',
        token: raw,
        prompt: `Address ${raw} was not found in the circuit.`,
        candidates: dedupeByCanonical(wireCandidates, context),
      };
    }
  }

  const unique = dedupeByCanonical(candidates, context);
  if (unique.length === 1) {
    return { status: 'resolved', address: unique[0] };
  }
  if (unique.length > 1) {
    const columnMatch = registerForAddress(raw, context);
    if (columnMatch) {
      return { status: 'resolved', address: columnMatch };
    }
    return {
      status: 'clarify',
      token: raw,
      prompt: `Address ${raw} could mean several bindings.`,
      candidates: unique,
    };
  }

  if (candidates.length > 0) {
    return {
      status: 'clarify',
      token: raw,
      prompt: `I could not find address ${raw} in the circuit.`,
      candidates,
    };
  }

  return { status: 'resolved', address: raw.includes(':') ? bare : base };
};

export const resolveWireAddressOr = (name: string, context: NlCorrectionContext): string => {
  const resolution = resolveWireAddress(name, context);
  return resolution.status === 'resolved' ? resolution.address : name.trim();
};
