/**
 * Minimal complex-number utilities used by the state-vector simulator.
 *
 * The project keeps this math layer small and dependency-free so gate operations
 * can be audited alongside the simulator code that consumes them.
 */
export type Complex = Readonly<{ re: number; im: number }>;

export const complex = (re = 0, im = 0): Complex => ({ re, im });
export const ZERO = complex(0, 0);
export const ONE = complex(1, 0);

export const add = (a: Complex, b: Complex): Complex => complex(a.re + b.re, a.im + b.im);
export const sub = (a: Complex, b: Complex): Complex => complex(a.re - b.re, a.im - b.im);
export const mul = (a: Complex, b: Complex): Complex => complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const scale = (a: Complex, scalar: number): Complex => complex(a.re * scalar, a.im * scalar);
export const magnitudeSquared = (a: Complex): number => a.re * a.re + a.im * a.im;

export const formatComplex = (value: Complex): string => {
  const re = Math.abs(value.re) < 1e-10 ? 0 : value.re;
  const im = Math.abs(value.im) < 1e-10 ? 0 : value.im;
  if (im === 0) return re.toFixed(3);
  if (re === 0) return `${im.toFixed(3)}i`;
  return `${re.toFixed(3)} ${im >= 0 ? '+' : '-'} ${Math.abs(im).toFixed(3)}i`;
};
