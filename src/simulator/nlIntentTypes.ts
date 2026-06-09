import type { CorrectionGuidance } from './circuitCorrector';
import type { TruthTable } from './truthTable';

export type ModelCorrectionIntent = {
  reply: string;
  loadFullAdderTable?: boolean;
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
};

export type NlCorrectionIntent = ModelCorrectionIntent;
