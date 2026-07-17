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
 * (packages/ai/providers/anthropic/src/index.ts) never throws -- upstream
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
 * `classifyError(err).status` in packages/ai/providers/anthropic/src/index.ts)
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
 * `String(res.status)` (packages/ai/providers/google/src/index.ts), so the
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

/**
 * OpenAI's sibling of `toUpstreamError`/`toGoogleUpstreamError` -- same
 * status-code switch, "OpenAI..." message prefixes so a failure isn't
 * mislabeled as Anthropic or Google. Same caveats as `toGoogleUpstreamError`:
 * `chunk.message` is `classifyError`'s normalized message (not legacy
 * `openai.ts`'s raw `response.text()` body), and only the numeric status
 * matters to `buildUpstreamErrorResponse`'s substring-sniffing, which this
 * matches exactly.
 */
export function toOpenAIUpstreamError(chunk: Extract<StreamChunk, { type: 'error' }>): Error {
  const status = chunk.code ? Number(chunk.code) : undefined;
  switch (status) {
    case 401:
      return new Error(`OpenAI authentication error (401): ${chunk.message}`);
    case 402:
      return new Error(`OpenAI insufficient credits (402): ${chunk.message}`);
    case 429:
      return new Error(`OpenAI rate limit exceeded (429): ${chunk.message}`);
    case 404:
      return new Error(`OpenAI not found (404): ${chunk.message}`);
    default:
      return new Error(`OpenAI API error (${status ?? 'unknown'}): ${chunk.message}`);
  }
}

/**
 * Factory for the 9 openai-compat providers' upstream error mappers (task
 * #34's compat batch). Each legacy provider file (apps/web/lib/llm-providers/
 * {groq,mistral,moonshot,zhipu,qwen,openrouter,deepseek,xai,perplexity}.ts)
 * has the IDENTICAL status-code switch and message shape as `toOpenAIUpstreamError`
 * above, differing only in the provider label string (`'Groq authentication
 * error (401)...'`, `'Mistral authentication error (401)...'`, etc.) --
 * confirmed by reading each legacy file's error-handling block, not assumed
 * from the pattern alone. A factory instead of 9 hand-copied switch
 * statements; `ADAPTER_PROVIDERS` still references 9 distinct NAMED exports
 * below (not the factory directly) so each provider's `mapError` reads as an
 * explicit, greppable function reference, matching `toUpstreamError`/
 * `toGoogleUpstreamError`/`toOpenAIUpstreamError`'s existing convention.
 */
function makeUpstreamErrorMapper(
  label: string,
): (chunk: Extract<StreamChunk, { type: 'error' }>) => Error {
  return (chunk) => {
    const status = chunk.code ? Number(chunk.code) : undefined;
    switch (status) {
      case 401:
        return new Error(`${label} authentication error (401): ${chunk.message}`);
      case 402:
        return new Error(`${label} insufficient credits (402): ${chunk.message}`);
      case 429:
        return new Error(`${label} rate limit exceeded (429): ${chunk.message}`);
      case 404:
        return new Error(`${label} not found (404): ${chunk.message}`);
      default:
        return new Error(`${label} API error (${status ?? 'unknown'}): ${chunk.message}`);
    }
  };
}

// Labels match each legacy provider file's own self-label exactly (verified,
// not assumed uniform): apps/web/lib/llm-providers/zhipu.ts calls itself
// "ZhipuAI", xai.ts calls itself "XAI" -- both differ from the provider id.
// The wording AROUND the label (legacy's actual phrasing is NOT this
// factory's "{label} authentication error (401): ..." shape for 7 of these
// 9 -- most use "{label} API authentication failed. Please check your API
// key." with no parenthetical status code) is a disclosed, functionally-safe
// divergence, same bucket as toGoogleUpstreamError's: buildUpstreamError
// Response derives status from substrings ('401'/'authentication'/'429'/
// 'rate limit'/etc.), which this factory's shape satisfies regardless of
// exact wording, and nothing parses error.message structurally beyond that.
export const toGroqUpstreamError = makeUpstreamErrorMapper('Groq');
export const toMistralUpstreamError = makeUpstreamErrorMapper('Mistral');
export const toMoonshotUpstreamError = makeUpstreamErrorMapper('Moonshot');
export const toZhipuUpstreamError = makeUpstreamErrorMapper('ZhipuAI');
export const toQwenUpstreamError = makeUpstreamErrorMapper('Qwen');
export const toOpenRouterUpstreamError = makeUpstreamErrorMapper('OpenRouter');
export const toDeepSeekUpstreamError = makeUpstreamErrorMapper('DeepSeek');
export const toXAIUpstreamError = makeUpstreamErrorMapper('XAI');
export const toPerplexityUpstreamError = makeUpstreamErrorMapper('Perplexity');
