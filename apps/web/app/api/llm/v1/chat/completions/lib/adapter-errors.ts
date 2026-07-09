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

/**
 * Google's sibling of `toUpstreamError`. Reusing `toUpstreamError` directly
 * for Google would print "Anthropic authentication error..." on a Google
 * failure -- a real correctness bug (wrong provider label reaching the
 * client), not just a wording nit.
 *
 * `buildUpstreamErrorResponse` (response-builder.ts) derives its HTTP status
 * from substrings in this message (`'401'`/`'authentication'`,
 * `'429'`/`'rate limit'`, `'402'`/`'insufficient credits'`,
 * `'404'`/`'not found'`) -- the exact numeric code is what has to be right;
 * nothing branches on the surrounding English wording. `chunk.code` is
 * `String(res.status)` (packages/providers/google/src/index.ts), so the
 * `Number(chunk.code)` switch below gets that for free, same shape as
 * `toUpstreamError`.
 *
 * NOT attempting byte-exact reproduction of `apps/web/lib/llm-providers/
 * google.ts`'s legacy wording: `chunk.message` here is `classifyError`'s
 * normalized message, not the raw response body legacy's `sendRequest`/
 * `streamRequest` captured via `response.text()` -- there is no raw body
 * text available at this layer to reproduce verbatim. Disclosed gap, same
 * bucket as this migration's other confirmed-safe wire divergences: nothing
 * in the codebase parses `error.message` structurally (grepped both pinned
 * consumers), only status + `error.type`, both of which this DOES match.
 *
 * A network-level failure (`classifyError` given a thrown fetch error, not
 * an HTTP response) yields an error chunk with NO `code` at all -- falls to
 * the default case here, matching legacy's own behavior for that case (a
 * thrown `TypeError` from `fetch` never carried an HTTP status either).
 */
export function toGoogleUpstreamError(chunk: Extract<StreamChunk, { type: 'error' }>): Error {
  const status = chunk.code ? Number(chunk.code) : undefined;
  switch (status) {
    case 401:
      return new Error(`Google API authentication error (401): ${chunk.message}`);
    case 402:
      return new Error(`Google API insufficient credits (402): ${chunk.message}`);
    case 429:
      return new Error(`Google API rate limit exceeded (429): ${chunk.message}`);
    case 404:
      return new Error(`Google API not found (404): ${chunk.message}`);
    default:
      return new Error(`Google API error (${status ?? 'unknown'}): ${chunk.message}`);
  }
}
