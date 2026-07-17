/**
 * Mid-stream provider failure detection — mobile-local mirror of
 * `hasStreamError`/`getStreamErrorMessage` in
 * packages/ui/unified-chat/src/lib/continue-generation.ts (web + desktop share
 * that copy directly; mobile is a separate module graph — React Native
 * doesn't consume the web-oriented shared package — so this is a deliberate,
 * minimal mirror, not a duplicate abstraction to consolidate).
 *
 * Two independent signals, either one is sufficient:
 *  1. `metadata.streamError` — the additive `x_stream_error` delta
 *     (chatExecutionStore persists it as `{message, code?, retryable?}`,
 *     accepted here as either that object or a bare string, defensively).
 *  2. `metadata.finishReason === 'error'` — RETROACTIVE detection for turns
 *     persisted before the marker existed (legacy-web has passed the literal
 *     'error' finish_reason through for a while).
 */

interface StreamErrorLikeMetadata {
  streamError?: unknown;
  finishReason?: unknown;
}

interface MessageStreamErrorLike {
  metadata?: StreamErrorLikeMetadata | Record<string, unknown>;
}

export function hasMessageStreamError(message: MessageStreamErrorLike | undefined | null): boolean {
  if (!message) return false;
  const meta = message.metadata as StreamErrorLikeMetadata | undefined;
  if (meta?.finishReason === 'error') return true;
  const streamError = meta?.streamError;
  if (typeof streamError === 'string') return streamError.length > 0;
  if (streamError && typeof streamError === 'object') {
    const msg = (streamError as { message?: unknown }).message;
    return typeof msg === 'string' && msg.length > 0;
  }
  return false;
}

/** Read the human-readable failure message, when one survived (see the retroactive case's doc note). */
export function getMessageStreamErrorMessage(
  message: MessageStreamErrorLike | undefined | null,
): string | undefined {
  if (!message) return undefined;
  const meta = message.metadata as StreamErrorLikeMetadata | undefined;
  const streamError = meta?.streamError;
  if (typeof streamError === 'string' && streamError.length > 0) return streamError;
  if (streamError && typeof streamError === 'object') {
    const msg = (streamError as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  // Retroactive case: finishReason==='error' with no marker at all -- no
  // classified message survived, only the fact that it happened.
  return undefined;
}
