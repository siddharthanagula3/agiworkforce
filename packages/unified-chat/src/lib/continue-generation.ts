/**
 * Continue Generation (ChatGPT/Claude parity) — shared predicate.
 *
 * An assistant turn is "continuable" when it ended EARLY with partial content:
 *   - the provider truncated it at the max-token cap (finish_reason 'length',
 *     or 'max_tokens' on the legacy Anthropic web wire), or
 *   - the user stopped generation mid-stream (client marker 'stopped', set by
 *     the surface's abort handling) and some text had already streamed.
 *
 * A normally-completed turn (finish_reason 'stop' / 'end_turn' / anything
 * else, or no recorded finish reason at all) is NOT continuable — offering
 * Continue there would be a fake affordance. Likewise an empty partial has
 * nothing to continue, and an errored turn goes through Regenerate instead.
 *
 * This lives in the shared package so EVERY surface (web `useChatStream`,
 * desktop `useChat` cloud mode) imports ONE copy of the semantics rather than
 * duplicating the predicate. Both the web store `Message` and the shared
 * `ChatMessage` satisfy `ContinuableMessageLike`.
 */

/** Finish reasons that mark a turn as continuable (truncated or user-stopped). */
const CONTINUABLE_FINISH_REASONS = new Set(['length', 'max_tokens', 'stopped']);

export function isContinuableFinishReason(reason: unknown): boolean {
  return typeof reason === 'string' && CONTINUABLE_FINISH_REASONS.has(reason);
}

/** Minimal message shape the predicate needs (store Message and ChatMessage both satisfy it). */
export interface ContinuableMessageLike {
  role?: string;
  content?: string;
  isStreaming?: boolean;
  /** Boolean on the store Message, string on ChatMessage — any truthy value disqualifies. */
  error?: unknown;
  metadata?: { finishReason?: unknown } | Record<string, unknown>;
}

/**
 * True when the Continue control should be offered for this message.
 * Callers additionally restrict it to the LAST assistant message in the
 * transcript — continuing an earlier turn would fork history.
 */
export function isMessageContinuable(message: ContinuableMessageLike | undefined | null): boolean {
  if (!message) return false;
  if (message.role !== 'assistant') return false;
  if (message.isStreaming) return false;
  if (message.error) return false;
  if (!message.content || !message.content.trim()) return false;
  return isContinuableFinishReason(
    (message.metadata as { finishReason?: unknown } | undefined)?.finishReason,
  );
}

/**
 * Instruction appended (as an ephemeral user turn, request-only — never stored
 * or rendered) after the partial assistant message so every provider continues
 * the SAME answer instead of restarting it. Anthropic would honor a bare
 * assistant prefill, but the OpenAI-compatible wire needs the explicit ask.
 */
export const CONTINUE_GENERATION_INSTRUCTION =
  'Continue your previous response from exactly where it left off. ' +
  'Do not repeat any earlier content, do not restart the answer, and do not add any preamble ' +
  'or acknowledgement — output only the direct continuation. If the response was cut off ' +
  'mid-sentence, mid-word, or mid-code-block, resume at that exact point.';
