import 'server-only';

import type { StreamChunk } from '@agiworkforce/types';

/**
 * Bridges an adapter's `{type:'error'}` `StreamChunk` back into a thrown
 * `Error`, reproducing `apps/web/lib/llm-providers/anthropic.ts`'s
 * `handleAnthropicHttpError`'s exact message phrasing for the 4 status
 * codes `buildUpstreamErrorResponse` (response-builder.ts) keyword-sniffs
 * (401/402/429/404) -- that function maps `errorMessage.includes('401')` /
 * `'authentication'` / `'rate limit'` / etc. to HTTP status codes, and this
 * reproduces exactly the substrings it looks for.
 *
 * WHY THIS EXISTS: `createAnthropicAdapter(...).stream()`
 * (packages/providers/anthropic/src/index.ts) never throws -- upstream
 * failures (auth, rate limit, network) are caught internally and surfaced
 * as a clean `{type:'error', code, message, retryable}` chunk followed by
 * `{type:'stop', reason:'error'}`, so callers never have two different
 * failure shapes to handle. But `route.ts`'s existing try/catch around the
 * OLD `LLMProviderFactory.streamRequest`/`sendRequest` calls is what
 * triggers `refundFailedReservation` (refunds the free-trial prompt or
 * reserved credits) AND `buildUpstreamErrorResponse` (a proper 401/429/etc.
 * JSON error instead of a 200 stream). Without bridging the error chunk back
 * into a throw, a request that fails before producing any content would
 * silently become a 200 response with `finish_reason: 'error'`/empty
 * content -- no correct status code, and (this is the actual money bug) the
 * user's reservation is never refunded.
 *
 * Uses `classified.status` (via the chunk's `code` field, set from
 * `classifyError(err).status` in packages/providers/anthropic/src/index.ts)
 * rather than pattern-matching the Anthropic SDK's own raw error message --
 * the SDK's message text isn't verified to contain the substrings
 * `buildUpstreamErrorResponse` looks for, whereas the structured numeric
 * status is reliable and is the actual signal `handleAnthropicHttpError`
 * switched on too.
 */
export function toUpstreamError(chunk: Extract<StreamChunk, { type: 'error' }>): Error {
  const status = chunk.code ? Number(chunk.code) : undefined;
  switch (status) {
    case 401:
      return new Error(`Anthropic authentication error (401): ${chunk.message}`);
    case 402:
      return new Error(`Anthropic insufficient credits (402): ${chunk.message}`);
    case 429:
      return new Error(`Anthropic rate limit exceeded (429): ${chunk.message}`);
    case 404:
      return new Error(`Anthropic not found (404): ${chunk.message}`);
    default:
      return new Error(`Anthropic API error (${status ?? 'unknown'}): ${chunk.message}`);
  }
}
