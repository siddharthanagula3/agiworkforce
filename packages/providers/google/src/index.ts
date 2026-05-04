/**
 * @agiworkforce/providers-google
 *
 * Gemini provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Talks directly to
 * `https://generativelanguage.googleapis.com/v1beta` — no vendor SDK; the
 * Gemini wire is small, stable, and the SDK has churned. API-key auth.
 *
 * Tool schemas pass through `cleanSchemaForGemini` from
 * `@agiworkforce/llm-normalize` to scrub the JSON Schema keywords Cloud
 * Code Assist's validator rejects (additionalProperties, $ref,
 * minLength/maxLength/pattern, etc.).
 *
 * Vertex AI (OAuth + project/region routing) is **NOT** wired here —
 * follow-up package or a `vertexBaseUrl` config knob.
 *
 * @packageDocumentation
 */

import type {
  AuthMethod,
  ChatRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderAdapterFactory,
  ProviderCatalogContext,
  StreamChunk,
} from '@agiworkforce/types';

import { fetchGoogleCatalog, GOOGLE_MODEL_CATALOG } from './catalog';
import { translateChatRequest } from './translate';
import { parseGeminiStream, translateGeminiStream } from './stream';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

const GOOGLE_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'GOOGLE_API_KEY',
    required: true,
    label: 'Google AI Studio API Key',
  },
  {
    kind: 'gcp-adc',
    label: 'Google Cloud ADC (Vertex AI — not yet wired)',
  },
];

export interface GoogleAdapterConfig extends ProviderAdapterConfig {
  /** Optional base URL override (e.g., a regional Generative Language endpoint). */
  baseUrl?: string;
  /** Skip dynamic /listModels discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
}

export function createGoogleAdapter(config: GoogleAdapterConfig = {}): ProviderAdapter {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const fetchFn = config.fetch ?? fetch;

  return {
    id: 'google',
    label: 'Google Gemini',
    auth: GOOGLE_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery || !config.apiKey) {
        return [...GOOGLE_MODEL_CATALOG];
      }
      return fetchGoogleCatalog({
        apiKey: config.apiKey,
        baseUrl: ctx?.baseUrl ?? baseUrl,
        fetch: ctx?.fetch ?? fetchFn,
        ...(ctx?.signal ? { signal: ctx.signal } : {}),
      });
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      if (!config.apiKey) {
        yield {
          type: 'error',
          message: 'Google adapter requires apiKey (GOOGLE_API_KEY)',
        };
        yield { type: 'stop', reason: 'error' };
        return;
      }

      const body = translateChatRequest(req);
      const url = `${baseUrl.replace(
        /\/+$/,
        '',
      )}/v1beta/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;

      let res: Response;
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        const error = err as Error;
        yield {
          type: 'error',
          message: error.message ?? 'Google request failed',
          retryable: true,
        };
        yield { type: 'stop', reason: 'error' };
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        yield {
          type: 'error',
          code: String(res.status),
          message: `Google responded ${res.status}: ${text || res.statusText}`,
          retryable: res.status >= 500,
        };
        yield { type: 'stop', reason: 'error' };
        return;
      }
      if (!res.body) {
        yield { type: 'error', message: 'Google response has no body' };
        yield { type: 'stop', reason: 'error' };
        return;
      }

      for await (const chunk of translateGeminiStream(parseGeminiStream(res.body))) {
        yield chunk;
      }
    },
  };
}

export const googleAdapterFactory: ProviderAdapterFactory = (config) =>
  createGoogleAdapter(config as GoogleAdapterConfig);

export { GOOGLE_MODEL_CATALOG, fetchGoogleCatalog } from './catalog';
export { translateChatRequest } from './translate';
export { parseGeminiStream, translateGeminiStream } from './stream';
export type * from './types';
