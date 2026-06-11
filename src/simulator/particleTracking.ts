import { complex, magnitudeSquared, type Complex } from './complex';
import { hasBit } from './gates/operations';
import type { CircuitGate, MeasurementMap } from './types';

/** Bloch-vector Cartesian components for a single qubit marginal. */
export type BlochVector = {
  x: number;
  y: number;
  z: number;
};

/** Spherical coordinates (r, θ, φ) derived from the Bloch vector. */
export type SphericalCoordinates = {
  /** Bloch-vector length in [0, 1]; 1 means a pure marginal state. */
  r: number;
  /** Polar angle θ from the +Z axis in radians. */
  theta: number;
  /** Azimuthal angle φ in radians. */
  phi: number;
};

export type ParticleSnapshot = {
  qubit: number;
  bloch: BlochVector;
  spherical: SphericalCoordinates;
  probOne: number;
  measured?: 0 | 1;
};

export type ParticleDelta = {
  qubit: number;
  deltaR: number;
  deltaTheta: number;
  deltaPhi: number;
  /** Euclidean distance moved on the Bloch sphere. */
  displacement: number;
};

export type OperationTransition = {
  step: number;
  gateId: string;
  gateType: string;
  inputQubits: number[];
  outputQubits: number[];
  before: ParticleSnapshot[];
  after: ParticleSnapshot[];
  deltas: ParticleDelta[];
};

const bitMask = (qubit: number, qubitCount: number) => 1 << (qubitCount - qubit - 1);

const marginalRho = (state: Complex[], qubitCount: number, qubit: number) => {
  const mask = bitMask(qubit, qubitCount);
  let rho00 = 0;
  let rho11 = 0;
  let rho01re = 0;
  let rho01im = 0;

  for (let index = 0; index < state.length; index += 1) {
    if ((index & mask) !== 0) continue;
    const amp0 = state[index];
    const amp1 = state[index | mask];
    rho00 += magnitudeSquared(amp0);
    rho11 += magnitudeSquared(amp1);
    rho01re += amp0.re * amp1.re + amp0.im * amp1.im;
    rho01im += amp0.im * amp1.re - amp0.re * amp1.im;
  }

  return { rho00, rho11, rho01: complex(rho01re, rho01im) };
};

export const blochVectorForQubit = (
  state: Complex[],
  qubitCount: number,
  qubit: number,
  measurements: MeasurementMap = {},
): BlochVector => {
  const measured = measurements[qubit];
  if (measured !== undefined) {
    return { x: 0, y: 0, z: measured === 1 ? 1 : -1 };
  }

  const { rho00, rho11, rho01 } = marginalRho(state, qubitCount, qubit);
  return {
    x: 2 * rho01.re,
    y: 2 * rho01.im,
    z: rho00 - rho11,
  };
};

export const sphericalFromBloch = ({ x, y, z }: BlochVector): SphericalCoordinates => {
  const r = Math.sqrt(x * x + y * y + z * z);
  if (r < 1e-12) {
    return { r: 0, theta: 0, phi: 0 };
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, z / r)));
  const phi = Math.atan2(y, x);
  return { r, theta, phi };
};

export const snapshotParticle = (
  state: Complex[],
  qubitCount: number,
  qubit: number,
  measurements: MeasurementMap = {},
): ParticleSnapshot => {
  const bloch = blochVectorForQubit(state, qubitCount, qubit, measurements);
  const spherical = sphericalFromBloch(bloch);
  const measured = measurements[qubit];
  return {
    qubit,
    bloch,
    spherical,
    probOne: (1 - bloch.z) / 2,
    measured,
  };
};

export const snapshotAllParticles = (
  state: Complex[],
  qubitCount: number,
  measurements: MeasurementMap = {},
): ParticleSnapshot[] =>
  Array.from({ length: qubitCount }, (_, qubit) => snapshotParticle(state, qubitCount, qubit, measurements));

const normalizeAngleDelta = (delta: number) => {
  let value = delta;
  while (value > Math.PI) value -= 2 * Math.PI;
  while (value < -Math.PI) value += 2 * Math.PI;
  return value;
};

export const particleDelta = (before: ParticleSnapshot, after: ParticleSnapshot): ParticleDelta => {
  const dx = after.bloch.x - before.bloch.x;
  const dy = after.bloch.y - before.bloch.y;
  const dz = after.bloch.z - before.bloch.z;
  return {
    qubit: before.qubit,
    deltaR: after.spherical.r - before.spherical.r,
    deltaTheta: after.spherical.theta - before.spherical.theta,
    deltaPhi: normalizeAngleDelta(after.spherical.phi - before.spherical.phi),
    displacement: Math.sqrt(dx * dx + dy * dy + dz * dz),
  };
};

export const computeParticleDeltas = (before: ParticleSnapshot[], after: ParticleSnapshot[]): ParticleDelta[] =>
  before.map((snapshot, index) => particleDelta(snapshot, after[index] ?? snapshot));

export const buildOperationTransition = (
  gate: CircuitGate,
  stateBefore: Complex[],
  stateAfter: Complex[],
  qubitCount: number,
  measurementsBefore: MeasurementMap,
  measurementsAfter: MeasurementMap,
): OperationTransition => {
  const before = snapshotAllParticles(stateBefore, qubitCount, measurementsBefore);
  const after = snapshotAllParticles(stateAfter, qubitCount, measurementsAfter);
  const inputQubits = gate.type === 'SWAP'
    ? gate.targets
    : gate.controls.length > 0
      ? gate.controls
      : gate.targets;
  return {
    step: gate.step,
    gateId: gate.id,
    gateType: String(gate.type),
    inputQubits,
    outputQubits: gate.targets,
    before,
    after,
    deltas: computeParticleDeltas(before, after),
  };
};
