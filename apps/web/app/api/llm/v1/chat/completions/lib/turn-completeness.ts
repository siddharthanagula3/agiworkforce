import 'server-only';

import { classifyError, type ClassifiedError } from '@agiworkforce/provider-runtime';

/**
 * One definition of "the model produced nothing" and one of "the turn did not
 * finish", for every server path that persists a turn.
 *
 * Three paths used to answer both questions their own way: the tool loop had a
 * detector, the managed-agent stream had another, and the plain chat path had
 * none at all, so whether an empty turn was recorded honestly depended on which
 * implementation served it.
 */

const BLOCKED_FINISH_REASONS: ReadonlySet<string> = new Set(['refusal', 'content_filter']);
const CANCELLED_FINISH_REASONS: ReadonlySet<string> = new Set(['cancelled', 'cancel']);
const MAX_OUTPUT_FINISH_REASONS: ReadonlySet<string> = new Set(['length', 'max_tokens']);

export function isBlockedFinishReason(finishReason: string | null): boolean {
  return finishReason !== null && BLOCKED_FINISH_REASONS.has(finishReason);
}

export function isCancelledFinishReason(finishReason: string | null): boolean {
  return finishReason !== null && CANCELLED_FINISH_REASONS.has(finishReason);
}

export function isMaxOutputFinishReason(finishReason: string | null): boolean {
  return finishReason !== null && MAX_OUTPUT_FINISH_REASONS.has(finishReason);
}

/**
 * What the reader would have seen. Reasoning is deliberately not counted: a
 * model that spent its whole budget thinking showed the reader nothing to keep,
 * and a turn whose only content is a thinking block is as empty as one with no
 * content at all.
 */
export interface TurnVisibleOutput {
  text: string;
  toolCalls?: number;
  generatedFiles?: number;
  interactiveCards?: number;
  otherVisibleOutput?: boolean;
}

export function isEmptyTurnOutput(output: TurnVisibleOutput): boolean {
  return (
    output.text.trim().length === 0 &&
    (output.toolCalls ?? 0) === 0 &&
    (output.generatedFiles ?? 0) === 0 &&
    (output.interactiveCards ?? 0) === 0 &&
    output.otherVisibleOutput !== true
  );
}

export interface TurnTruncationInput {
  /** The stream carried a failure of its own, however it was reported. */
  reportedFailure: boolean;
  finishReason: string | null;
  emptyOutput: boolean;
  cancelled?: boolean;
}

/**
 * A turn is truncated unless it ran to a terminal signal with something to
 * show. Persisting `truncated: false` on an empty turn is what put a blank
 * assistant bubble in the transcript on reload, with nothing to say why.
 */
export function isTurnTruncated(input: TurnTruncationInput): boolean {
  if (input.reportedFailure) return true;
  if (input.cancelled === true) return true;
  if (isCancelledFinishReason(input.finishReason)) return true;
  if (input.finishReason === null) return true;
  if (input.finishReason === 'error') return true;
  return input.emptyOutput;
}

export interface ProviderStreamFailure {
  message: string;
  code?: string;
  retryable?: boolean;
}

const HTTP_STATUS_CODE = /^\d{3}$/;

function classifyReportedFailure(failure: ProviderStreamFailure): ClassifiedError {
  return classifyError(
    Object.assign(
      new Error(failure.message),
      HTTP_STATUS_CODE.test(failure.code ?? '') ? { status: Number(failure.code) } : {},
    ),
  );
}

export interface EmptyTurnClassificationInput {
  finishReason: string | null;
  providerError?: ProviderStreamFailure | undefined;
  reasoningReceived?: boolean;
}

/**
 * Why the turn came back with nothing, in the taxonomy the copy layer already
 * speaks. Synthesising `empty_response` for every one of these told a reader
 * whose answer hit the output cap, whose connection dropped and whose request
 * was refused the same uninformative thing.
 */
export function classifyEmptyTurn(input: EmptyTurnClassificationInput): ClassifiedError {
  if (isBlockedFinishReason(input.finishReason)) {
    return {
      category: 'content_blocked',
      code: 'content_blocked',
      retryable: false,
      fallbackable: true,
      message: 'The model blocked this response before returning any content.',
    };
  }
  if (input.providerError?.message) {
    return classifyReportedFailure(input.providerError);
  }
  if (isMaxOutputFinishReason(input.finishReason)) {
    return {
      category: 'max_output',
      code: 'max_output_tokens_exceeded',
      retryable: false,
      fallbackable: true,
      message: input.reasoningReceived
        ? 'The model spent its whole output budget reasoning and never wrote an answer.'
        : 'The model reached its output limit before writing an answer.',
    };
  }
  if (input.finishReason === null || input.finishReason === 'error') {
    return {
      category: 'connection',
      code: 'stream_interrupted',
      retryable: true,
      fallbackable: true,
      message: 'The response stream ended before the model finished.',
    };
  }
  return {
    category: 'empty_response',
    code: 'empty_response',
    retryable: false,
    fallbackable: true,
    message: 'The model finished without returning a response.',
  };
}
