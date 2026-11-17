import type { ChatMessage as LocalLlmMessage } from '@agiworkforce/local-llm';

export const DEFAULT_LOCAL_SYSTEM_PROMPT =
  "You are AGI, a concise helpful assistant running locally on this device. Answer the user's current request directly. Keep final answers separate from any thinking or reasoning text. Do not invent a different prompt or test unless the user explicitly asks you to create one.";

export function ensureLocalSystemPrompt(messages: LocalLlmMessage[]): LocalLlmMessage[] {
  const rest = messages.filter(
    (message) =>
      !(message.role === 'system' && message.content.trim() === DEFAULT_LOCAL_SYSTEM_PROMPT),
  );
  return [{ role: 'system', content: DEFAULT_LOCAL_SYSTEM_PROMPT }, ...rest];
}
