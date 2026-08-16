import 'server-only';

import type { StreamChunk } from '@agiworkforce/types';

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
  const error = new Error(message) as Error & { status?: number };
  if (Number.isFinite(status)) error.status = status;
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
