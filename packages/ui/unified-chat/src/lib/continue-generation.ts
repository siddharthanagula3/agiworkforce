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

/** The additive marker's shape once persisted to `metadata.streamError`. */
export interface StreamErrorInfo {
  message: string;
  code?: string;
  retryable?: boolean;
}

/** Minimal message shape needed to detect a mid-stream provider failure. */
export interface StreamErrorMessageLike {
  metadata?: { streamError?: unknown; finishReason?: unknown } | Record<string, unknown>;
}

/**
 * True when this assistant turn ended because the provider failed mid-stream
 * (after the SSE response had already committed a 200) rather than completing
 * normally. Two independent signals, either one is sufficient:
 *
 *  1. `metadata.streamError` — the additive `x_stream_error` delta the server
 *     emits going forward (see openai-wire-compat.ts's `sseChunks()` 'error'
 *     case), latched by the stream consumer alongside the still-persisted
 *     partial content. Accepts both the current object shape
 *     (`{message, code?, retryable?}`) and a bare string, defensively.
 *  2. `metadata.finishReason === 'error'` — RETROACTIVE detection for turns
 *     persisted before the `x_stream_error` marker existed. The legacy-web
 *     wire (Anthropic/Google) has passed the literal string 'error' through
 *     `finish_reason` for a while (`legacyWebFinishReason` verbatim-passes
 *     any reason it doesn't special-case), so historical messages can carry
 *     `finishReason: 'error'` with no marker at all. `finish_reason` alone
 *     can't be the PRIMARY signal going forward — the openai-passthrough wire
 *     (10 of 12 providers) can't safely say 'error' there (`OpenAIWireFinishReason`
 *     is a closed union matching real OpenAI's actual values, deliberately
 *     excluding it, see openai-wire-compat.ts) — but it's a reliable
 *     backward-compat signal for the wire it DOES appear on.
 *
 * Lives alongside `isMessageContinuable` for the same reason: both are
 * "how did this turn end, what recovery affordance should the UI offer"
 * checks, shared by web (`useChatStream`) and desktop (`useChat` cloud mode)
 * so the two surfaces render the same partial-response + retry treatment.
 */
export function hasStreamError(message: StreamErrorMessageLike | undefined | null): boolean {
  if (!message) return false;
  const meta = message.metadata as { streamError?: unknown; finishReason?: unknown } | undefined;
  if (meta?.finishReason === 'error') return true;
  const streamError = meta?.streamError;
  if (typeof streamError === 'string') return streamError.length > 0;
  if (streamError && typeof streamError === 'object') {
    const msg = (streamError as { message?: unknown }).message;
    return typeof msg === 'string' && msg.length > 0;
  }
  return false;
}

/**
 * Read the human-readable failure message off a message flagged by
 * `hasStreamError`, regardless of which of the two signals fired. Returns
 * `undefined` only when neither signal is present (callers should already
 * have checked `hasStreamError` first) or the marker carries no message.
 */
export function getStreamErrorMessage(
  message: StreamErrorMessageLike | undefined | null,
): string | undefined {
  if (!message) return undefined;
  const meta = message.metadata as { streamError?: unknown; finishReason?: unknown } | undefined;
  const streamError = meta?.streamError;
  if (typeof streamError === 'string' && streamError.length > 0) return streamError;
  if (streamError && typeof streamError === 'object') {
    const msg = (streamError as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  // Retroactive case: finishReason==='error' with no marker at all -- no
  // classified message survived, only the fact that it happened.
  if (meta?.finishReason === 'error') return undefined;
  return undefined;
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
