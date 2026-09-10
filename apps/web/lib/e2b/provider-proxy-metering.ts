import 'server-only';

import { normalizeModelId, resolveMaxOutputTokens } from '@agiworkforce/types';
import type { ProviderProxyMeteredEndpoint } from '@/lib/e2b/provider-proxy';

const CHARS_PER_TOKEN = 4;
const PER_REQUEST_OVERHEAD_TOKENS = 8;
const MAX_ESTIMATED_PROMPT_TOKENS = 1_000_000;

const PROMPT_FIELDS: Readonly<Record<ProviderProxyMeteredEndpoint, readonly string[]>> = {
  anthropic_messages: ['system', 'messages', 'tools', 'tool_choice'],
  openai_responses: ['instructions', 'input', 'tools', 'tool_choice'],
  openai_chat_completions: ['messages', 'tools', 'tool_choice'],
  openai_embeddings: ['input'],
};

const MAX_OUTPUT_FIELDS: Readonly<Record<ProviderProxyMeteredEndpoint, readonly string[]>> = {
  anthropic_messages: ['max_tokens'],
  openai_responses: ['max_output_tokens'],
  openai_chat_completions: ['max_completion_tokens', 'max_tokens'],
  openai_embeddings: [],
};

export class ProviderProxyRequestShapeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderProxyRequestShapeError';
  }
}

export interface ProviderProxyMeteredRequest {
  model: string;
  requestedModel: string;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  body: Record<string, unknown>;
  forwardBody: string;
}

function estimatePromptTokens(
  endpoint: ProviderProxyMeteredEndpoint,
  body: Record<string, unknown>,
): number {
  const serialized = PROMPT_FIELDS[endpoint]
    .map((field) => (body[field] === undefined ? '' : JSON.stringify(body[field])))
    .join('');
  const tokens = Math.ceil(serialized.length / CHARS_PER_TOKEN) + PER_REQUEST_OVERHEAD_TOKENS;
  return Math.min(tokens, MAX_ESTIMATED_PROMPT_TOKENS);
}

function estimateCompletionTokens(
  endpoint: ProviderProxyMeteredEndpoint,
  body: Record<string, unknown>,
  model: string,
): number {
  const fields = MAX_OUTPUT_FIELDS[endpoint];
  if (fields.length === 0) return 0;
  for (const field of fields) {
    const declared = body[field];
    if (typeof declared === 'number' && Number.isFinite(declared) && declared > 0) {
      return Math.ceil(declared);
    }
  }
  return resolveMaxOutputTokens(model);
}

/**
 * Chat Completions omits usage from a stream unless the caller opts in, and a
 * harness that never asks would be served for free. The opt-in is added to the
 * body the proxy forwards, not to the one the sandbox sent, and the extra
 * final chunk it produces is inert to any client that ignores it.
 */
function applyStreamUsageOptIn(
  endpoint: ProviderProxyMeteredEndpoint,
  body: Record<string, unknown>,
): Record<string, unknown> {
  if (endpoint !== 'openai_chat_completions' || body['stream'] !== true) return body;
  const existing =
    body['stream_options'] && typeof body['stream_options'] === 'object'
      ? (body['stream_options'] as Record<string, unknown>)
      : {};
  return { ...body, stream_options: { ...existing, include_usage: true } };
}

export function parseProviderProxyMeteredRequest(
  endpoint: ProviderProxyMeteredEndpoint,
  rawBody: string,
): ProviderProxyMeteredRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new ProviderProxyRequestShapeError(
      'provider_proxy_body_invalid',
      'This request body is not valid JSON, so its cost cannot be reserved.',
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProviderProxyRequestShapeError(
      'provider_proxy_body_invalid',
      'This request body is not a JSON object, so its cost cannot be reserved.',
    );
  }

  const body = parsed as Record<string, unknown>;
  const requestedModel = typeof body['model'] === 'string' ? body['model'].trim() : '';
  if (!requestedModel) {
    throw new ProviderProxyRequestShapeError(
      'provider_proxy_model_required',
      'This request names no model, so its cost cannot be reserved.',
    );
  }

  const model = normalizeModelId(requestedModel) ?? requestedModel;
  const forwarded = applyStreamUsageOptIn(endpoint, body);
  return {
    model,
    requestedModel,
    estimatedPromptTokens: estimatePromptTokens(endpoint, body),
    estimatedCompletionTokens: estimateCompletionTokens(endpoint, body, model),
    body: forwarded,
    forwardBody: forwarded === body ? rawBody : JSON.stringify(forwarded),
  };
}
