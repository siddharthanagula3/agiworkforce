import {
  statableRetryAfterSeconds,
  statedWait,
  withoutExternalPurchaseSteering,
} from '@/services/failureCopy';

interface StreamErrorLikeMetadata {
  streamError?: unknown;
  finishReason?: unknown;
}

interface MessageStreamErrorLike {
  metadata?: StreamErrorLikeMetadata | Record<string, unknown>;
}

export interface StreamFailure {
  message: string;
  code?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
  requestId?: string;
}

/**
 * The gateway sends the wait it was given and the id it logged on the same
 * frame as the sentence. Dropping either leaves a reader with nothing to tell
 * support and no idea when the window reopens, so both are read here rather
 * than at each of the two call sites that ingest the frame.
 */
export function parseStreamFailure(raw: unknown): StreamFailure | undefined {
  if (typeof raw === 'string') {
    return raw ? { message: withoutExternalPurchaseSteering(raw) } : undefined;
  }
  if (!raw || typeof raw !== 'object') return undefined;
  const frame = raw as Record<string, unknown>;
  const sent = frame['message'];
  if (typeof sent !== 'string' || !sent) return undefined;
  const message = withoutExternalPurchaseSteering(sent);
  const code = frame['code'];
  const retryable = frame['retryable'];
  const retryAfterSeconds = statableRetryAfterSeconds(frame['retryAfterSeconds']);
  const requestId = frame['requestId'];
  return {
    message,
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof retryable === 'boolean' ? { retryable } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(typeof requestId === 'string' && requestId ? { requestId } : {}),
  };
}

/**
 * A provider that closes its stream cleanly with nothing in it produced no
 * answer, and this surface says so in the words the web app uses for the same
 * condition rather than naming the transport the reader never chose.
 */
export const EMPTY_RESPONSE_FAILURE: StreamFailure = {
  message: 'The model finished without returning a response. Try again.',
  code: 'empty_response',
  retryable: true,
};

const NO_FAILURE_NAMED = "This turn didn't complete. No response was received.";
const PARTIAL_PREFIX = 'Response may be incomplete';

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
  return undefined;
}

export interface TurnOutputSignals {
  content: string;
  toolCallCount: number;
  generatedFileCount: number;
  interactiveCardCount: number;
  hasResearchRun: boolean;
  hasStreamError: boolean;
}

/**
 * A Deep Research turn paused for plan approval streams a plan and no prose, so
 * counting only text would report the paused plan as an empty response.
 */
export function turnProducedNothing(signals: TurnOutputSignals): boolean {
  return (
    !signals.content.trim() &&
    signals.toolCallCount === 0 &&
    signals.generatedFileCount === 0 &&
    signals.interactiveCardCount === 0 &&
    !signals.hasResearchRun &&
    !signals.hasStreamError
  );
}

export function getMessageStreamErrorCode(
  message: MessageStreamErrorLike | undefined | null,
): string | undefined {
  const streamError = (message?.metadata as StreamErrorLikeMetadata | undefined)?.streamError;
  if (streamError && typeof streamError === 'object') {
    const code = (streamError as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return undefined;
}

export function getMessageStreamErrorRetryAfter(
  message: MessageStreamErrorLike | undefined | null,
): number | undefined {
  const streamError = (message?.metadata as StreamErrorLikeMetadata | undefined)?.streamError;
  if (!streamError || typeof streamError !== 'object') return undefined;
  return statableRetryAfterSeconds(
    (streamError as { retryAfterSeconds?: unknown }).retryAfterSeconds,
  );
}

export function getMessageStreamErrorReference(
  message: MessageStreamErrorLike | undefined | null,
): string | undefined {
  const streamError = (message?.metadata as StreamErrorLikeMetadata | undefined)?.streamError;
  if (!streamError || typeof streamError !== 'object') return undefined;
  const requestId = (streamError as { requestId?: unknown }).requestId;
  return typeof requestId === 'string' && requestId ? requestId : undefined;
}

/**
 * The one sentence a failed turn ends on.
 *
 * A turn that produced nothing is not an incomplete response: prefixing the
 * gateway's "finished without returning a response" with "Response may be
 * incomplete" put two contradictory clauses in front of a reader who had no
 * response at all. The prefix is now what it claims to be, a note attached to
 * partial text that really is cut off.
 *
 * The wait is stated only when the sentence itself names no figure, because
 * the gateway already inlines one whenever a provider supplied it, and the id
 * is appended only when the server logged one.
 */
export function streamFailureNoticeText(
  message: (MessageStreamErrorLike & { content?: string }) | undefined | null,
): string {
  const detail = getMessageStreamErrorMessage(message);
  const hasPartialText = Boolean(message?.content?.trim());
  const base = detail
    ? hasPartialText
      ? `${PARTIAL_PREFIX}: ${detail}`
      : detail
    : hasPartialText
      ? PARTIAL_PREFIX
      : NO_FAILURE_NAMED;
  const wait = statedWait(getMessageStreamErrorRetryAfter(message));
  const withWait = wait && !/\d/.test(base) ? `${base} Try again in ${wait}.` : base;
  const reference = getMessageStreamErrorReference(message);
  return reference ? `${withWait} Reference: ${reference}` : withWait;
}
