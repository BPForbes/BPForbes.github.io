import type { CorrectionGuidance } from '../correction/circuitCorrector';
import type { TruthTable, TruthTableTestResult } from '../compiler/truthTable';

export type ProcessCatalogSummary = {
  name: string;
  origin: string;
  fileName?: string;
  inputColumns: string[];
  outputColumns: string[];
  rowCount?: number;
  combinatorialRowCount?: number;
  isPartialTruthTable?: boolean;
  hasTruthTable?: boolean;
  truthTableProtected?: boolean;
  summary: string;
  description?: string;
};

// Clarification options carry executable follow-up commands, not just display text.
export type ClarificationOption = {
  label: string;
  command: string;
};

export type PendingClarification = {
  prompt: string;
  options: ClarificationOption[];
};

// Intent flags are additive so a reply can request a table load, correction run, and persistence step together.
export type ModelCorrectionIntent = {
  reply: string;
  loadFullAdderTable?: boolean;
  loadCatalogProcess?: string;
  inferTable?: boolean;
  probeOutputs?: boolean;
  runTest?: boolean;
  autonomous?: boolean;
  updateQpuio?: boolean;
  updateQpucir?: boolean;
  guidance?: CorrectionGuidance;
  truthTable?: TruthTable;
  clarification?: PendingClarification;
};

// Context is a serializable snapshot of UI/compiler state; executors decide how to apply any returned intent.
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
