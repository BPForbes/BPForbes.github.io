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
  extractProcessName,
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

export type { NlCorrectionContext, NlCorrectionIntent } from './naturalLanguageCorrector';
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
  if (testResult.passed) {
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
