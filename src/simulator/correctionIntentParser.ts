import type { LlmSettings } from './llmConfig';
import type { ModelCorrectionIntent, NlCorrectionContext } from './nlIntentTypes';
import {
  isClarificationIntent,
  isRegexFallbackIntent,
  parseNaturalLanguageCorrection,
} from './naturalLanguageCorrector';
import { parseNaturalLanguageWithModel } from './modelNaturalLanguageCorrector';

export type CorrectionIntentParseOptions = {
  useLlm?: boolean;
  llmSettings?: LlmSettings;
  onProgress?: (text: string) => void;
};

/** Fast regex parser first; optional browser or Ollama LLM for unrecognized messages. */
export const parseCorrectionIntent = async (
  message: string,
  context: NlCorrectionContext,
  options: CorrectionIntentParseOptions = {},
): Promise<ModelCorrectionIntent> => {
  const regexIntent = parseNaturalLanguageCorrection(message, context);
  if (isClarificationIntent(regexIntent) || !options.useLlm || !isRegexFallbackIntent(regexIntent)) {
    return regexIntent;
  }

  const settings = options.llmSettings;
  if (settings?.mode === 'ollama') {
    options.onProgress?.(`Asking Ollama (${settings.ollamaModel})…`);
    return await parseNaturalLanguageWithModel(message, context, {
      url: settings.ollamaUrl,
      model: settings.ollamaModel,
    }) ?? regexIntent;
  }

  options.onProgress?.('Using cached browser model…');
  const { parseNaturalLanguageWithWebLlm } = await import('./webLlmNaturalLanguageCorrector');
  return await parseNaturalLanguageWithWebLlm(message, context, {
    modelId: settings?.browserModel,
    onProgress: options.onProgress,
  }) ?? regexIntent;
};
