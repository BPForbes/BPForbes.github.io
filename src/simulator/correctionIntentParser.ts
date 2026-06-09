import type { LlmEndpointConfig } from './llmConfig';
import type { ModelCorrectionIntent, NlCorrectionContext } from './nlIntentTypes';
import { isRegexFallbackIntent, parseNaturalLanguageCorrection } from './naturalLanguageCorrector';
import { parseNaturalLanguageWithModel } from './modelNaturalLanguageCorrector';

export type CorrectionIntentParseOptions = {
  useLlm?: boolean;
  llmEndpoint?: LlmEndpointConfig;
  onProgress?: (text: string) => void;
};

/** Fast regex parser first; optional local LLM (Ollama) only for unrecognized messages. */
export const parseCorrectionIntent = async (
  message: string,
  context: NlCorrectionContext,
  options: CorrectionIntentParseOptions = {},
): Promise<ModelCorrectionIntent> => {
  const regexIntent = parseNaturalLanguageCorrection(message, context);
  if (!options.useLlm || !isRegexFallbackIntent(regexIntent)) {
    return regexIntent;
  }

  options.onProgress?.(`Asking local model (${options.llmEndpoint?.model ?? 'ollama'})…`);
  return await parseNaturalLanguageWithModel(message, context, options.llmEndpoint) ?? regexIntent;
};
