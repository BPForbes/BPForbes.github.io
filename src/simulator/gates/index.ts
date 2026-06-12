/**
 * Public gate-module entry point.
 *
 * Consumers import through this file when they need the registry-facing gate
 * API without depending on the internal preconfigured/custom organization.
 */
export * from './matrices';
export * from './operations';
export * from './types';
export * from './registry';
export * from './customGateEngine';
export * from './arity';
export { preconfiguredGates, preconfiguredGateMap } from './preconfigured';
