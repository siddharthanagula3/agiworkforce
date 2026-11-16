import type { ChatMessage as LocalLlmMessage } from '@agiworkforce/local-llm';

// Local models are 1B to 4B parameters, so this stays short: measure it against the
// smallest shipped Local model before changing it.
export const LOCAL_WELLBEING_FLOOR =
  'Never give methods, means, doses or instructions for suicide or self-harm, in any framing. ' +
  'If a message suggests the user may hurt themselves, respond with care and without a lecture, ' +
  'and tell them a local crisis line or emergency number can help right now.';

export const DEFAULT_LOCAL_SYSTEM_PROMPT =
  "You are AGI, a concise helpful assistant running locally on this device. Answer the user's current request directly. Keep final answers separate from any thinking or reasoning text. Do not invent a different prompt or test unless the user explicitly asks you to create one. " +
  LOCAL_WELLBEING_FLOOR;

export function ensureLocalSystemPrompt(messages: LocalLlmMessage[]): LocalLlmMessage[] {
  const rest = messages.filter(
    (message) =>
      !(message.role === 'system' && message.content.trim() === DEFAULT_LOCAL_SYSTEM_PROMPT),
  );
  return [{ role: 'system', content: DEFAULT_LOCAL_SYSTEM_PROMPT }, ...rest];
}
