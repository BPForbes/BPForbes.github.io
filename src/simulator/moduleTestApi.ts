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
  extractProcessName,
  formatTestFailureSummary,
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

export type { ModelCorrectionIntent, NlCorrectionContext, NlCorrectionIntent } from './nlIntentTypes';
export { parseNaturalLanguageCorrection } from './naturalLanguageCorrector';
import type { CorrectionGuidance } from './circuitCorrector';
import { correctCircuit } from './circuitCorrector';
import type { TruthTable, TruthTableTestResult } from './truthTable';
import {
  createEmptyTruthTable,
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
};

export type ModuleTestResponse = {
  dimensions: ReturnType<typeof inferTruthTableDimensions>;
  truthTable: TruthTable;
  testResult: TruthTableTestResult;
  correctedSource?: string;
  correctionSteps?: ReturnType<typeof correctCircuit>['steps'];
};

export const runModuleTest = (request: ModuleTestRequest): ModuleTestResponse => {
  const dimensions = inferTruthTableDimensions(request.source);
  const truthTable = request.truthTable ?? createEmptyTruthTable(request.source);
  const validationErrors = validateTruthTable(truthTable, request.source);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(' '));
  }

  const testResult = testCircuitAgainstTruthTable(request.source, truthTable, request.librarySources);
  if (testResult.passed || request.correct === false) {
    return { dimensions, truthTable, testResult };
  }

  const correction = correctCircuit(
    request.source,
    truthTable,
    request.librarySources,
    request.guidance,
    { autonomous: request.autonomous ?? true },
  );

  return {
    dimensions,
    truthTable,
    testResult: correction.testResult,
    correctedSource: correction.source,
    correctionSteps: correction.steps,
  };
};

export const probeModuleOutputs = (
  source: string,
  truthTable: TruthTable,
  librarySources: Record<string, string> = {},
): TruthTable => fillTruthTableFromCircuit(source, truthTable, librarySources);
