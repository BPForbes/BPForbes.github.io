import type { CorrectionGuidance } from './circuitCorrector';
import type { TruthTable, TruthTableTestResult } from './truthTable';

export type ProcessCatalogSummary = {
  name: string;
  origin: string;
  fileName?: string;
  inputColumns: string[];
  outputColumns: string[];
  rowCount?: number;
  hasTruthTable?: boolean;
  truthTableProtected?: boolean;
  summary: string;
  description?: string;
};

export type ClarificationOption = {
  label: string;
  command: string;
};

export type PendingClarification = {
  prompt: string;
  options: ClarificationOption[];
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
  clarification?: PendingClarification;
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
  pendingClarification?: PendingClarification | null;
};

export type NlCorrectionIntent = ModelCorrectionIntent;
