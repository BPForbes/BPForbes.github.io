/**
 * Guardrails for bundled truth-table assets that should not be rewritten by
 * correction flows.
 *
 * The protected list is centralized here so upload handling, catalog writes,
 * tests, and assistant prompts all enforce the same canonical metadata policy.
 */
import {
  fourBitFullAdderTruthTable,
  phaseDemoTruthTable,
  twoBitFullAdderTruthTable,
} from './bundledTruthTables';
import { configuredProcesses } from './protocolExamples';
import type { TruthTable } from '../simulator/truthTable';
import { cloneTruthTable, singleBitFullAdderTruthTable, truthTablesEqual } from '../simulator/truthTable';

const PROTECTED_PROCESS_NAMES = new Set([
  'SingleBitFullAdder',
  'TwoBitFullAdder',
  'FourBitFullAdder',
  'PhaseDemo',
]);

const canonicalByProcess = new Map<string, TruthTable>([
  ['SingleBitFullAdder', cloneTruthTable(singleBitFullAdderTruthTable())],
  ['TwoBitFullAdder', cloneTruthTable(twoBitFullAdderTruthTable())],
  ['FourBitFullAdder', cloneTruthTable(fourBitFullAdderTruthTable())],
  ['PhaseDemo', cloneTruthTable(phaseDemoTruthTable())],
]);

configuredProcesses.forEach((process) => {
  if (process.truthTable && PROTECTED_PROCESS_NAMES.has(process.name)) {
    canonicalByProcess.set(process.name, cloneTruthTable(process.truthTable));
  }
});

export const protectedQpuioProcessNames = () => Array.from(PROTECTED_PROCESS_NAMES);

export const isProtectedQpuioProcess = (processName: string | null | undefined) => (
  Boolean(processName && PROTECTED_PROCESS_NAMES.has(processName))
);

export const getProtectedTruthTable = (processName: string): TruthTable | undefined => {
  const canonical = canonicalByProcess.get(processName);
  return canonical ? cloneTruthTable(canonical) : undefined;
};

export const protectedQpuioFileNames = () => configuredProcesses
  .filter((process) => isProtectedQpuioProcess(process.name) && process.truthTableFileName)
  .map((process) => process.truthTableFileName as string);

export const getProtectedQpuioFileName = (processName: string): string | undefined => (
  configuredProcesses.find((process) => process.name === processName)?.truthTableFileName
);

const formatProtectedWarning = (processName: string, reason: string) => (
  `The truth table for ${processName} is protected site metadata and cannot be edited.\n\n${reason}\n\nThe table has been restored to its default state.`
);

export const warnProtectedTruthTable = (processName: string, reason: string) => {
  if (typeof window === 'undefined') return;
  window.alert(formatProtectedWarning(processName, reason));
};

export type ProtectedTruthTableResult = {
  truthTable: TruthTable;
  reverted: boolean;
};

export const enforceProtectedTruthTable = (
  processName: string | null | undefined,
  attempted: TruthTable | null | undefined,
): ProtectedTruthTableResult | null => {
  if (!processName || !isProtectedQpuioProcess(processName)) {
    return attempted ? { truthTable: attempted, reverted: false } : null;
  }

  const canonical = canonicalByProcess.get(processName);
  if (!canonical) {
    return attempted ? { truthTable: attempted, reverted: false } : null;
  }

  if (!attempted || truthTablesEqual(attempted, canonical)) {
    return { truthTable: cloneTruthTable(canonical), reverted: false };
  }

  return { truthTable: cloneTruthTable(canonical), reverted: true };
};
