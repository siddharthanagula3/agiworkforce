
const CONTINUABLE_FINISH_REASONS = new Set(['length', 'max_tokens', 'stopped']);

export function isContinuableFinishReason(reason: unknown): boolean {
  return typeof reason === 'string' && CONTINUABLE_FINISH_REASONS.has(reason);
}

export interface ContinuableMessageLike {
  role?: string;
  content?: string;
  isStreaming?: boolean;
  error?: unknown;
  metadata?: { finishReason?: unknown } | Record<string, unknown>;
}

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

export interface StreamErrorInfo {
  message: string;
  code?: string;
  retryable?: boolean;
}

export interface StreamErrorMessageLike {
  metadata?: { streamError?: unknown; finishReason?: unknown } | Record<string, unknown>;
}

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
  if (meta?.finishReason === 'error') return undefined;
  return undefined;
}

export const CONTINUE_GENERATION_INSTRUCTION =
  'Continue your previous response from exactly where it left off. ' +
  'Do not repeat any earlier content, do not restart the answer, and do not add any preamble ' +
  'or acknowledgement — output only the direct continuation. If the response was cut off ' +
  'mid-sentence, mid-word, or mid-code-block, resume at that exact point.';
