const CONTINUABLE_FINISH_REASONS = new Set(['length', 'max_tokens', 'stopped', 'pause_turn']);

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

/**
 * A failed turn persists a single zero-width space as its content, and
 * String.trim does not remove U+200B - it is not Unicode White_Space. A bare
 * trim therefore reads an empty failed turn as having content.
 */
export function hasVisibleContent(content: string | undefined | null): boolean {
  return (
    typeof content === 'string' && content.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().length > 0
  );
}

export function isMessageContinuable(message: ContinuableMessageLike | undefined | null): boolean {
  if (!message) return false;
  if (message.role !== 'assistant') return false;
  if (message.isStreaming) return false;
  if (message.error) return false;
  if (!hasVisibleContent(message.content)) return false;
  if (
    isContinuableFinishReason(
      (message.metadata as { finishReason?: unknown } | undefined)?.finishReason,
    )
  ) {
    return true;
  }
  // The finish reason is not the only evidence a turn is unfinished, and it is
  // not always honest. Continue only appends, so offering it on an answer that
  // reads as cut off costs a redundant control; withholding it strands the
  // reader with half an answer and no way to ask for the rest.
  return looksTruncated(message.content);
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

const SENTENCE_ENDINGS = /[.!?:;)\]}"'\u2019\u201d*_|`>-]$/u;

const NON_PROSE_LINE = /^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|\||```|~~~)/;

/**
 * Whether a finished answer reads as cut off. A provider can end a turn
 * mid-sentence and still report `stop`: the observed case ended on "ensures
 * continuous nighttime luminosity" with finish_reason stop and stopReason
 * end-turn, so nothing in the protocol said the answer was incomplete and the
 * reader was left with no way to ask for the rest.
 *
 * Only prose is judged. A list, a heading, a table row or a code line routinely
 * ends without punctuation and is not evidence of anything.
 */
export function looksTruncated(content: string | undefined | null): boolean {
  if (typeof content !== 'string') return false;
  const trimmed = content.trimEnd();
  if (!trimmed) return false;

  const fences = trimmed.match(/^\s{0,3}(?:```|~~~)/gm);
  if (fences && fences.length % 2 === 1) return true;

  const lastLine = trimmed.slice(trimmed.lastIndexOf('\n') + 1).trim();
  if (!lastLine || NON_PROSE_LINE.test(lastLine)) return false;
  if (lastLine.split(/\s+/).length < 4) return false;

  return !SENTENCE_ENDINGS.test(lastLine);
}
