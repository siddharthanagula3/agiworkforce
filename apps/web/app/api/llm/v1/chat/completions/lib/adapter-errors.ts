import 'server-only';

import type { StreamChunk } from '@agiworkforce/types';

/**
 * An upstream failure reconstructed from a provider `StreamChunk`.
 *
 * `classifyError` in `@agiworkforce/provider-runtime` reads `status` AND
 * `retryAfterSeconds` off the thrown value. Every adapter already computes
 * `retryAfterSeconds` from the real provider headers and attaches it to the
 * error chunk — but this layer used to rebuild a bare `Error` carrying only
 * `status`, so by the time managed failover classified the error a second time
 * the header value was structurally unrecoverable and rotation happened with
 * zero backoff regardless of what `Retry-After` said.
 *
 * Carrying the field through is what makes honouring `Retry-After` possible at
 * all downstream.
 */
export interface UpstreamError extends Error {
  status?: number;
  retryAfterSeconds?: number;
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
  // Preserve the provider's own Retry-After. Dropping it here is what made
  // `retryAfterSeconds` unrecoverable for every downstream consumer.
  if (typeof chunk.retryAfterSeconds === 'number' && Number.isFinite(chunk.retryAfterSeconds)) {
    error.retryAfterSeconds = chunk.retryAfterSeconds;
  }
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

function makeUpstreamErrorMapper(
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
export const toWorkersAiUpstreamError = makeUpstreamErrorMapper('Cloudflare Workers AI');
export const toVercelGatewayUpstreamError = makeUpstreamErrorMapper('Vercel AI Gateway');
