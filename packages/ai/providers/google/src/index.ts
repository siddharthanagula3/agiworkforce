/**
 * @agiworkforce/providers-google
 *
 * Gemini provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Talks directly to
 * `https://generativelanguage.googleapis.com/v1beta` — no vendor SDK; the
 * Gemini wire is small, stable, and the SDK has churned. API-key auth.
 *
 * Tool schemas pass through `cleanSchemaForGemini` from
 * `@agiworkforce/provider-protocol` to scrub the JSON Schema keywords Cloud
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
import { classifyError, withStreamIdleWatchdog } from '@agiworkforce/provider-runtime';

import { fetchGoogleCatalog, GOOGLE_MODEL_CATALOG } from './catalog';
import { translateChatRequest } from './translate';
import { parseGeminiStream, translateGeminiStream } from './stream';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

// FIX (audit 2026-05-20, §8): the Vertex AI / gcp-adc auth method was
// advertised in the catalog but the adapter has no implementation behind
// it. Importers that picked gcp-adc thinking it was functional would
// silently fall through the `!config.apiKey` branch in stream() and
// surface a misleading "requires apiKey" error. Until the Vertex adapter
// lands, only the api-key path is advertised here. The full method list
// (kept for documentation) is in the comment below.
//
// const FUTURE_AUTH_METHODS: readonly AuthMethod[] = [
//   { kind: 'gcp-adc', label: 'Google Cloud ADC (Vertex AI)' },
// ];
const GOOGLE_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'GOOGLE_API_KEY',
    required: true,
    label: 'Google AI Studio API Key',
  },
];

export interface GoogleAdapterConfig extends ProviderAdapterConfig {
  /** Optional base URL override (e.g., a regional Generative Language endpoint). */
  baseUrl?: string;
  /** Skip dynamic /listModels discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
}

export function createGoogleAdapter(config: GoogleAdapterConfig = {}): ProviderAdapter {
  // FIX (audit 2026-05-20, §8): fail-fast on Vertex/gcp-adc requests until
  // that path has a real adapter. Catches the case where a future caller
  // surfaces gcp-adc selection via authMethod or vertex-style config.
  if (
    (config as { authMethod?: string }).authMethod === 'gcp-adc' ||
    (config as { useVertex?: boolean }).useVertex === true
  ) {
    throw new Error(
      'Google Vertex AI / gcp-adc is unavailable in this adapter. ' +
        'Pass an api-key (GOOGLE_API_KEY) via createGoogleAdapter({ apiKey }) ' +
        'or switch to another configured adapter.',
    );
  }
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
      // API key is sent via the `x-goog-api-key` header — never as a `?key=`
      // query string. Keys in URLs leak via server access logs, browser
      // history, and proxy logs even over HTTPS. The Generative Language
      // API documents the header path as the recommended secure transport.
      // AUDIT-FIX: alert-404 — bound trailing-slash strip to avoid polynomial-redos.
      const url = `${baseUrl.replace(
        /\/{1,32}$/,
        '',
      )}/v1beta/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;

      let res: Response;
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': config.apiKey,
          },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        const classified = classifyError(err);
        yield {
          type: 'error',
          message: classified.message,
          retryable: classified.retryable,
          ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
          ...(classified.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: classified.retryAfterSeconds }
            : {}),
        };
        yield { type: 'stop', reason: 'error' };
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // Build a synthetic error to feed the classifier; res.headers is a
        // real Headers instance so retry-after parsing works without extra glue.
        const synthetic = {
          status: res.status,
          message: `Google responded ${res.status}: ${text || res.statusText}`,
          headers: res.headers,
        };
        const classified = classifyError(synthetic);
        yield {
          type: 'error',
          code: String(res.status),
          message: classified.message,
          retryable: classified.retryable,
          ...(classified.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: classified.retryAfterSeconds }
            : {}),
        };
        yield { type: 'stop', reason: 'error' };
        return;
      }
      if (!res.body) {
        yield { type: 'error', message: 'Google response has no body' };
        yield { type: 'stop', reason: 'error' };
        return;
      }

      const watched = withStreamIdleWatchdog(translateGeminiStream(parseGeminiStream(res.body)));
      for await (const chunk of watched) {
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
