// Re-export truth-table and correction primitives from one API so UI actions and tests use identical contracts.
export type {
  TruthCellValue,
  TruthTable,
  TruthTableDimensions,
  TruthTableRowResult,
  TruthTableTestResult,
} from './compiler';

export type {
  CircuitCorrectionResult,
  CorrectionGuidance,
  CorrectionStep,
  GatePreference,
  GuidedGateSpec,
} from './correction';

export {
  createEmptyTruthTable,
  createTruthTableFromColumns,
  describeTruthTableDimensions,
  extractProcessName,
  formatTestFailureSummary,
  formatTruthTableRowSummary,
  resizeTruthTable,
  fillTruthTableFromCircuit,
  indexToInputRow,
  inferTruthTableDimensions,
  isTruthCellValue,
  parseTruthTableJson,
  serializeTruthTableJson,
  simulateTruthTableOutputs,
  singleBitFullAdderTruthTable,
  testCircuitAgainstTruthTable,
  truthTablesEqual,
  validateTruthTable,
} from './compiler';

export {
  correctCircuit,
  inferTruthTableWithOutputs,
  synthesizeProtocolFromTruthTable,
} from './correction';

export type { ChildCorrectionResult } from './correction';
export {
  collectDescendantProcesses,
  correctChildProcessesForCompatibility,
  getReferencedChildProcesses,
} from './correction';

export type { ModelCorrectionIntent, NlCorrectionContext, NlCorrectionIntent } from './llm';
export { parseNaturalLanguageCorrection } from './llm';
import type { CorrectionGuidance } from './correction';
import { correctCircuit } from './correction';
import {
  correctChildProcessesForCompatibility,
  type ChildCorrectionResult,
} from './correction';
import type { TruthTable, TruthTableTestResult } from './compiler';
import {
  createEmptyTruthTable,
  describeTruthTableDimensions,
  fillTruthTableFromCircuit,
  inferTruthTableDimensions,
  testCircuitAgainstTruthTable,
  validateTruthTable,
} from './compiler';

// Module-test requests can run read-only checks or propagate corrections through child processes with truth tables.
export type ModuleTestRequest = {
  source: string;
  truthTable?: TruthTable;
  librarySources?: Record<string, string>;
  guidance?: CorrectionGuidance;
  autonomous?: boolean;
  correct?: boolean;
  propagateToChildren?: boolean;
  processName?: string;
  getTruthTable?: (processName: string) => TruthTable | undefined;
};

export type ModuleTestResponse = {
  dimensions: ReturnType<typeof describeTruthTableDimensions>;
  truthTable: TruthTable;
  testResult: TruthTableTestResult;
  correctedSource?: string;
  correctionSteps?: ReturnType<typeof correctCircuit>['steps'];
  childCorrections?: ChildCorrectionResult[];
  librarySources?: Record<string, string>;
};

// Module tests compile the active source with catalog/library children before comparing against the selected table.
export const runModuleTest = (request: ModuleTestRequest): ModuleTestResponse => {
  const truthTable = request.truthTable ?? createEmptyTruthTable(request.source);
  const dimensions = describeTruthTableDimensions(request.source, truthTable);
  const validationErrors = validateTruthTable(truthTable, request.source);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(' '));
  }

  let librarySources = { ...(request.librarySources ?? {}) };
  let childCorrections: ChildCorrectionResult[] | undefined;

  if (request.correct !== false && request.propagateToChildren !== false && request.processName && request.getTruthTable) {
    const childResult = correctChildProcessesForCompatibility(
      request.processName,
      librarySources,
      request.getTruthTable,
      request.guidance,
      request.autonomous ?? true,
    );
    librarySources = childResult.librarySources;
    childCorrections = childResult.childCorrections;
  }

  const testResult = testCircuitAgainstTruthTable(request.source, truthTable, librarySources);
  if (testResult.passed || request.correct === false) {
    return { dimensions, truthTable, testResult, childCorrections, librarySources };
  }

  const correction = correctCircuit(
    request.source,
    truthTable,
    librarySources,
    request.guidance,
    { autonomous: request.autonomous ?? true },
  );

  return {
    dimensions,
    truthTable,
    testResult: correction.testResult,
    correctedSource: correction.source,
    correctionSteps: correction.steps,
    childCorrections,
    librarySources,
  };
};

// Probing reuses truth-table inference without applying correction steps.
export const probeModuleOutputs = (
  source: string,
  truthTable: TruthTable,
  librarySources: Record<string, string> = {},
): TruthTable => fillTruthTableFromCircuit(source, truthTable, librarySources);
