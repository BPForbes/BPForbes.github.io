import { xGate } from './x';
import { yGate } from './y';
import { zGate } from './z';
import { hGate } from './h';
import { sGate } from './s';
import { tGate } from './t';
import { phaseGate } from './phase';
import { cnotGate } from './cnot';
import { ccnotGate } from './ccnot';
import { czGate } from './cz';
import { cyGate } from './cy';
import { swapGate } from './swap';
import { measureGate } from './measure';
import { resetGate } from './reset';
import { notGate } from './not';
import { andGate } from './and';
import { nandGate } from './nand';
import { orGate } from './or';
import { xorGate } from './xor';
import type { GateDefinition } from '../types';

export const preconfiguredGates: GateDefinition[] = [
  xGate,
  yGate,
  zGate,
  hGate,
  sGate,
  tGate,
  phaseGate,
  cnotGate,
  ccnotGate,
  czGate,
  cyGate,
  swapGate,
  measureGate,
  resetGate,
  notGate,
  andGate,
  nandGate,
  orGate,
  xorGate,
];

export const preconfiguredGateMap = Object.fromEntries(
  preconfiguredGates.map((gate) => [gate.id, gate]),
) as Record<string, GateDefinition>;
