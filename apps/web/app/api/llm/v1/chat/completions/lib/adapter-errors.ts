import 'server-only';

import type { StreamChunk, StreamChunkErrorClassification } from '@agiworkforce/types';

/**
 * An upstream failure reconstructed from a provider `StreamChunk`.
 *
 * `classifyError` in `@agiworkforce/provider-runtime` reads `status` AND
 * `retryAfterSeconds` off the thrown value. Every adapter already computes
 * `retryAfterSeconds` from the real provider headers and attaches it to the
 * error chunk. A bare `Error` carrying only `status` would lose it before
 * managed failover classifies the error a second time, and rotation would
 * ignore `Retry-After`, so the field is carried through.
 */
export interface UpstreamError extends Error {
  status?: number;
  retryAfterSeconds?: number;
  /**
   * The adapter's own classification, carried rather than re-derived.
   *
   * `message` below is built by concatenating the provider's text, and part of
   * that text can be chosen by whoever sent the request: the refusal raised for
   * an attachment a route cannot read names the file. Every routing decision
   * downstream, retry, failover, and the copy the reader sees, comes out of
   * `classifyError`, and with nothing structured to read it would re-parse
   * that string, so a file named `timeout.pdf` or `insufficient_quota.pdf`
   * could pick the failure class for the turn.
   *
   * `classifyError` reads this field first and only falls back to matching the
   * text when it is absent, which is what an adapter with nothing structured to
   * report still produces.
   */
  classification?: StreamChunkErrorClassification;
}

function providerUpstreamError(
  label: string,
  chunk: Extract<StreamChunk, { type: 'error' }>,
): Error {
  const status = chunk.code ? Number(chunk.code) : undefined;
  let message: string;
  switch (status) {
    case 401:
      message = `${label} authentication error (401): ${chunk.message}`;
      break;
    case 402:
      message = `${label} insufficient credits (402): ${chunk.message}`;
      break;
    case 429:
      message = `${label} rate limit exceeded (429): ${chunk.message}`;
      break;
    case 404:
      message = `${label} not found (404): ${chunk.message}`;
      break;
    default:
      message = `${label} API error (${status ?? 'unknown'}): ${chunk.message}`;
  }
  const error = new Error(message) as UpstreamError;
  if (Number.isFinite(status)) error.status = status;
  // Preserve the provider's own Retry-After: no downstream consumer can recover
  // `retryAfterSeconds` once it is dropped here.
  if (typeof chunk.retryAfterSeconds === 'number' && Number.isFinite(chunk.retryAfterSeconds)) {
    error.retryAfterSeconds = chunk.retryAfterSeconds;
  }
  if (chunk.classification) error.classification = chunk.classification;
  return error;
}

export function toUpstreamError(chunk: Extract<StreamChunk, { type: 'error' }>): Error {
  return providerUpstreamError('Anthropic', chunk);
}

export function toGoogleUpstreamError(chunk: Extract<StreamChunk, { type: 'error' }>): Error {
  return providerUpstreamError('Google API', chunk);
}

export function toOpenAIUpstreamError(chunk: Extract<StreamChunk, { type: 'error' }>): Error {
  return providerUpstreamError('OpenAI', chunk);
}

export function makeUpstreamErrorMapper(
  label: string,
): (chunk: Extract<StreamChunk, { type: 'error' }>) => Error {
  return (chunk) => providerUpstreamError(label, chunk);
}

export const toMinimaxUpstreamError = makeUpstreamErrorMapper('MiniMax');
export const toMoonshotUpstreamError = makeUpstreamErrorMapper('Moonshot');
export const toZhipuUpstreamError = makeUpstreamErrorMapper('ZhipuAI');
export const toQwenUpstreamError = makeUpstreamErrorMapper('Qwen');
export const toOpenRouterUpstreamError = makeUpstreamErrorMapper('OpenRouter');
export const toDeepSeekUpstreamError = makeUpstreamErrorMapper('DeepSeek');
export const toXAIUpstreamError = makeUpstreamErrorMapper('XAI');
export const toPerplexityUpstreamError = makeUpstreamErrorMapper('Perplexity');
export const toGroqUpstreamError = makeUpstreamErrorMapper('Groq');
export const toNvidiaNimUpstreamError = makeUpstreamErrorMapper('NVIDIA NIM');
export const toVercelGatewayUpstreamError = makeUpstreamErrorMapper('Vercel AI Gateway');
