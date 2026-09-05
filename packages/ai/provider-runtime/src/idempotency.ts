/**
 * Idempotency keys for operations a retry must not repeat.
 *
 * Derived from the caller's OWN request key rather than minted here, so a
 * client that retries a request with the same key produces the same operation
 * keys and a settled tool call or a settled charge is recognised as settled.
 *
 * PROVIDER HEADERS: none is emitted. As of 2026-09-05 neither the Anthropic
 * Messages API nor the OpenAI API documents an idempotency header; OpenAI
 * documents `X-Client-Request-Id`, which is a correlation id with no dedupe
 * semantics. Sending one anyway would claim a guarantee no provider has made,
 * so idempotency is enforced at this layer instead. Revisit per provider when a
 * primary source documents one.
 *
 * @module provider-runtime/idempotency
 * @packageDocumentation
 */

const SEGMENT_SEPARATOR = ':';
const TOOL_OPERATION = 'tool';
const STEP_OPERATION = 'step';
const RESUME_OPERATION = 'input';

export interface IdempotencyKeyInput {
  /** The caller's own key for the whole request. */
  requestKey: string;
  /** Which step of the loop this operation belongs to. */
  step: number;
  /** What is being made idempotent, within that step. */
  operation: readonly string[];
}

/**
 * Segments are percent-encoded before joining, so a request key or a
 * provider-minted tool call id containing the separator cannot forge another
 * operation's key.
 */
export function deriveIdempotencyKey(input: IdempotencyKeyInput): string {
  return [input.requestKey, String(input.step), ...input.operation]
    .map((segment) => encodeURIComponent(segment))
    .join(SEGMENT_SEPARATOR);
}

export function toolInvocationIdempotencyKey(input: {
  requestKey: string;
  step: number;
  toolCallId: string;
  /** Present only for a call resumed after asking the user for input. */
  resumeRound?: number;
}): string {
  return deriveIdempotencyKey({
    requestKey: input.requestKey,
    step: input.step,
    operation:
      input.resumeRound === undefined
        ? [TOOL_OPERATION, input.toolCallId]
        : [TOOL_OPERATION, input.toolCallId, RESUME_OPERATION, String(input.resumeRound)],
  });
}

export function meteredStepIdempotencyKey(input: { requestKey: string; step: number }): string {
  return deriveIdempotencyKey({
    requestKey: input.requestKey,
    step: input.step,
    operation: [STEP_OPERATION],
  });
}
