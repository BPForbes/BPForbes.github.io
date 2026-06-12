/**
 * Helpers for presenting and retrying ambiguous correction requests.
 *
 * Correction flows use these messages when user language maps to multiple
 * possible wires or actions, allowing the UI to ask a targeted follow-up rather
 * than applying a risky edit.
 */
import type { ClarificationOption, PendingClarification } from './llm/intentTypes';

export const formatClarificationPrompt = (
  prompt: string,
  options: ClarificationOption[],
): string => {
  const lines = options.map((option, index) => `${index + 1}. ${option.label}`);
  return [
    prompt,
    '',
    'Do you mean?',
    ...lines,
    '',
    'Reply with a number (e.g. 1), or describe your choice in plain language.',
  ].join('\n');
};

export const formatClarificationRetry = (pending: PendingClarification): string => (
  [
    `Please pick one option (1–${pending.options.length}), describe your choice, or say "cancel".`,
    '',
    'Do you mean?',
    ...pending.options.map((option, index) => `${index + 1}. ${option.label}`),
  ].join('\n')
);

export const resolveClarificationResponse = (
  message: string,
  pending: PendingClarification,
): ClarificationOption | null => {
  const trimmed = message.trim();
  if (!trimmed) return null;

  const numberMatch = trimmed.match(/^(?:option\s*)?#?(\d+)\.?$/i);
  if (numberMatch) {
    const index = Number(numberMatch[1]) - 1;
    if (index >= 0 && index < pending.options.length) {
      return pending.options[index];
    }
  }

  const lower = trimmed.toLowerCase();
  const exactLabel = pending.options.find((option) => lower === option.label.toLowerCase());
  if (exactLabel) return exactLabel;

  const partialLabel = pending.options.find((option) => {
    const labelLower = option.label.toLowerCase();
    return labelLower.includes(lower) || lower.includes(labelLower);
  });
  if (partialLabel) return partialLabel;

  const exactCommand = pending.options.find((option) => lower === option.command.toLowerCase());
  if (exactCommand) return exactCommand;

  return null;
};

export const buildClarificationIntent = (
  prompt: string,
  options: ClarificationOption[],
) => ({
  reply: formatClarificationPrompt(prompt, options),
  clarification: { prompt, options },
});
