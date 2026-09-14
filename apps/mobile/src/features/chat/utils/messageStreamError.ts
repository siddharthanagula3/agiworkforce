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
