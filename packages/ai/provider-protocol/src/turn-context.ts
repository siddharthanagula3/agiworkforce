const TURN_CONTEXT_OPEN = '<turn_context>';
const TURN_CONTEXT_CLOSE = '</turn_context>';

/**
 * Facts true only for this turn, such as the current time, travel after the
 * conversation instead of in the system prompt: a value that changes every
 * minute ahead of the history would make every provider re-read the whole
 * conversation uncached.
 */
export function formatTurnContext(text: string): string {
  return `${TURN_CONTEXT_OPEN}\n${text.trim()}\n${TURN_CONTEXT_CLOSE}`;
}

export function isTurnContextText(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(TURN_CONTEXT_OPEN);
}
