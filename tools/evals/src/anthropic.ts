/**
 * Live responder: one non-streaming Anthropic Messages call per case.
 *
 * The model id is never written down here. It is resolved from
 * `packages/contracts/types/src/models.json`, the repo's single source of model
 * truth, so a corpus run cannot quietly measure a model the catalog no longer
 * ships.
 *
 * @module evals/anthropic
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ModelResponse, Responder } from './types';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

/** Wire version pinned by `crates/agiworkforce-llm/src/stream.rs`. */
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Per-request ceiling. Not configurable: every caller wants the same bound, and
 * a run that hangs on one row would stall the whole corpus behind it.
 */
const REQUEST_TIMEOUT_MS = 60_000;

const CATALOG_PATH = '../../../packages/contracts/types/src/models.json';

export interface ResolvedModel {
  /** Catalog key. */
  readonly id: string;
  /** What goes on the wire. */
  readonly apiModelId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pick the Anthropic model a live run measures.
 *
 * `providers.anthropic.defaultModel` is the catalog's own answer to "which
 * Claude does this product reach for", so the eval measures what users get
 * rather than a model chosen by whoever wrote the harness.
 */
export function resolveAnthropicModel(catalog: unknown): ResolvedModel {
  if (!isRecord(catalog)) throw new Error('model catalog is not an object');

  const providers = catalog['providers'];
  const anthropic = isRecord(providers) ? providers['anthropic'] : undefined;
  const defaultModel = isRecord(anthropic) ? anthropic['defaultModel'] : undefined;
  if (typeof defaultModel !== 'string' || defaultModel.length === 0) {
    throw new Error('model catalog has no providers.anthropic.defaultModel');
  }

  const models = catalog['models'];
  const entry = isRecord(models) ? models[defaultModel] : undefined;
  if (!isRecord(entry)) {
    throw new Error(`model catalog has no models.${defaultModel} entry`);
  }
  if (entry['provider'] !== 'anthropic') {
    throw new Error(`models.${defaultModel} is not an anthropic model`);
  }
  const apiModelId = entry['apiModelId'];
  if (typeof apiModelId !== 'string' || apiModelId.length === 0) {
    throw new Error(`models.${defaultModel} has no apiModelId`);
  }

  return { id: defaultModel, apiModelId };
}

/** Read the committed model catalog. */
export function readModelCatalog(): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(CATALOG_PATH, import.meta.url)), 'utf8'));
}

/**
 * Extract the answer from a Messages response.
 *
 * The payload is provider output, so nothing about its shape is assumed: a
 * response whose `content` is missing or holds no text block yields empty text,
 * which the graders score as a failure rather than crashing the run.
 */
export function extractResponse(payload: unknown): ModelResponse {
  const record = isRecord(payload) ? payload : {};
  const blocks = Array.isArray(record['content']) ? record['content'] : [];
  const text = blocks
    .filter((block): block is Record<string, unknown> => isRecord(block))
    .filter((block) => block['type'] === 'text' && typeof block['text'] === 'string')
    .map((block) => block['text'] as string)
    .join('');

  const stopReason = record['stop_reason'];
  return typeof stopReason === 'string' ? { text, stopReason } : { text };
}

export interface AnthropicResponderOptions {
  readonly apiKey: string;
  readonly apiModelId: string;
  /** Injected so the request shape can be asserted without a paid call. */
  readonly fetchImpl?: typeof fetch;
  readonly maxOutputTokens?: number;
}

/** Build a responder that answers each case with one Messages call. */
export function anthropicResponder(options: AnthropicResponderOptions): Responder {
  const { apiKey, apiModelId, fetchImpl = fetch, maxOutputTokens = 512 } = options;

  if (apiKey.length === 0) throw new Error('anthropicResponder requires an API key');

  return async (evalCase) => {
    const response = await fetchImpl(MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: apiModelId,
        max_tokens: maxOutputTokens,
        messages: [{ role: 'user', content: evalCase.prompt }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Truncated: a provider error body can be long, and the failing status
      // plus the case id is what identifies the problem.
      const body = (await response.text()).slice(0, 200);
      throw new Error(`anthropic ${response.status} for ${evalCase.id}: ${body}`);
    }

    return extractResponse(await response.json());
  };
}
