import type { CorrectionGuidance } from './circuitCorrector';
import type { TruthTable, TruthTableTestResult } from './truthTable';

export type ProcessCatalogSummary = {
  name: string;
  origin: string;
  inputColumns: string[];
  outputColumns: string[];
  rowCount?: number;
  summary: string;
  description?: string;
};

export type ModelCorrectionIntent = {
  reply: string;
  loadFullAdderTable?: boolean;
  loadCatalogProcess?: string;
  inferTable?: boolean;
  probeOutputs?: boolean;
  runTest?: boolean;
  autonomous?: boolean;
  guidance?: CorrectionGuidance;
  truthTable?: TruthTable;
};

export type NlCorrectionContext = {
  source: string;
  truthTable: TruthTable | null;
  inputColumns: string[];
  outputColumns: string[];
  activeProcessName?: string | null;
  processCatalog?: ProcessCatalogSummary[];
  lastTestResult?: TruthTableTestResult | null;
  libraryProcessNames?: string[];
};

export type NlCorrectionIntent = ModelCorrectionIntent;
