export type {
  TruthCellValue,
  TruthTable,
  TruthTableDimensions,
  TruthTableRowResult,
  TruthTableTestResult,
} from './truthTable';

export type {
  CircuitCorrectionResult,
  CorrectionGuidance,
  CorrectionStep,
  GatePreference,
  GuidedGateSpec,
} from './circuitCorrector';

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
} from './truthTable';

export {
  correctCircuit,
  inferTruthTableWithOutputs,
  synthesizeProtocolFromTruthTable,
} from './circuitCorrector';

export type { ChildCorrectionResult } from './childProcessCorrection';
export {
  collectDescendantProcesses,
  correctChildProcessesForCompatibility,
  getReferencedChildProcesses,
} from './childProcessCorrection';

export type { ModelCorrectionIntent, NlCorrectionContext, NlCorrectionIntent } from './nlIntentTypes';
export { parseNaturalLanguageCorrection } from './naturalLanguageCorrector';
import type { CorrectionGuidance } from './circuitCorrector';
import { correctCircuit } from './circuitCorrector';
import {
  correctChildProcessesForCompatibility,
  type ChildCorrectionResult,
} from './childProcessCorrection';
import type { TruthTable, TruthTableTestResult } from './truthTable';
import {
  createEmptyTruthTable,
  describeTruthTableDimensions,
  fillTruthTableFromCircuit,
  inferTruthTableDimensions,
  testCircuitAgainstTruthTable,
  validateTruthTable,
} from './truthTable';

export type ModuleTestRequest = {
  source: string;
  truthTable?: TruthTable;
  librarySources?: Record<string, string>;
  guidance?: CorrectionGuidance;
  autonomous?: boolean;
  /** When false, only test and report failures without mutating the circuit. */
  correct?: boolean;
  /** When correcting, also test and fix declared child processes that have truth tables. */
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

export const probeModuleOutputs = (
  source: string,
  truthTable: TruthTable,
  librarySources: Record<string, string> = {},
): TruthTable => fillTruthTableFromCircuit(source, truthTable, librarySources);
