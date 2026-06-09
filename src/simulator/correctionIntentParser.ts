import type { ModelCorrectionIntent, NlCorrectionContext } from './nlIntentTypes';
import { isRegexFallbackIntent, parseNaturalLanguageCorrection } from './naturalLanguageCorrector';

export type CorrectionIntentParseOptions = {
  useWebLlm?: boolean;
  onProgress?: (text: string) => void;
};

/** Fast regex parser first; optional WebLLM only for unrecognized messages. */
export const parseCorrectionIntent = async (
  message: string,
  context: NlCorrectionContext,
  options: CorrectionIntentParseOptions = {},
): Promise<ModelCorrectionIntent> => {
  const regexIntent = parseNaturalLanguageCorrection(message, context);
  if (!options.useWebLlm || !isRegexFallbackIntent(regexIntent)) {
    return regexIntent;
  }

  const { parseNaturalLanguageWithWebLlm } = await import('./webLlmNaturalLanguageCorrector');
  return await parseNaturalLanguageWithWebLlm(message, context, options.onProgress) ?? regexIntent;
};
