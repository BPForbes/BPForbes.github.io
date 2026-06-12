import { complex, ONE, ZERO } from '../complex';

const INV_SQRT2 = 1 / Math.sqrt(2);

/** Pauli-X */
export const MATRIX_X = [[ZERO, ONE], [ONE, ZERO]] as const;

/** Pauli-Y */
export const MATRIX_Y = [[ZERO, complex(0, -1)], [complex(0, 1), ZERO]] as const;

/** Pauli-Z */
export const MATRIX_Z = [[ONE, ZERO], [ZERO, complex(-1, 0)]] as const;

/** Hadamard */
export const MATRIX_H = [
  [complex(INV_SQRT2), complex(INV_SQRT2)],
  [complex(INV_SQRT2), complex(-INV_SQRT2)],
] as const;

/** S gate (π/2 phase on |1⟩) */
export const MATRIX_S = [[ONE, ZERO], [ZERO, complex(0, 1)]] as const;

/** T gate (π/4 phase on |1⟩) */
export const MATRIX_T = [[ONE, ZERO], [ZERO, complex(INV_SQRT2, INV_SQRT2)]] as const;

/** Arbitrary phase P(θ) = diag(1, e^{iθ}) */
export const phaseMatrix = (angle: number) => [[ONE, ZERO], [ZERO, complex(Math.cos(angle), Math.sin(angle))]];

export const PHASE_PI = Math.PI;
export const PHASE_PI_2 = Math.PI / 2;
export const PHASE_PI_4 = Math.PI / 4;
