import { toolAcceptsUntrustedContent } from './tool-metadata';

/** Fence tag for a summary of a span that included a tool result from outside the trust boundary. */
export const SUMMARIZED_UNTRUSTED_HISTORY_TAG = 'summarized_untrusted_history';

/** Fence tag for a summary that did not include such a tool result. */
export const SUMMARIZED_HISTORY_TAG = 'summarized_history';

const UNTRUSTED_HISTORY_OPEN = `<${SUMMARIZED_UNTRUSTED_HISTORY_TAG}>`;

export function messageCarriesSummarizedUntrustedHistory(content: unknown): boolean {
  return typeof content === 'string' && content.includes(UNTRUSTED_HISTORY_OPEN);
}

function toolCallName(call: unknown): string | null {
  if (!call || typeof call !== 'object') return null;
  const fn = (call as { function?: unknown }).function;
  if (!fn || typeof fn !== 'object') return null;
  const name = (fn as { name?: unknown }).name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

export function droppedSpanIncludesUntrustedTool(
  messages: readonly { tool_calls?: unknown[] }[],
  droppedIndices: readonly number[],
): boolean {
  for (const index of droppedIndices) {
    const calls = messages[index]?.tool_calls;
    if (!Array.isArray(calls)) continue;
    for (const call of calls) {
      const name = toolCallName(call);
      if (name && toolAcceptsUntrustedContent(name)) return true;
    }
  }
  return false;
}
