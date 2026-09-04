/**
 * @agiworkforce/providers-google
 *
 * Gemini provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Talks directly to
 * `https://generativelanguage.googleapis.com/v1beta`, no vendor SDK; the
 * Gemini wire is small, stable, and the SDK has churned. API-key auth.
 *
 * Tool schemas pass through `cleanSchemaForGemini` from
 * `@agiworkforce/provider-protocol` to scrub the JSON Schema keywords Cloud
 * Code Assist's validator rejects (additionalProperties, $ref,
 * minLength/maxLength/pattern, etc.).
 *
 * Vertex AI (OAuth + project/region routing) is **NOT** wired here.
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
const GEMINI_API_VERSION_SEGMENT = 'v1beta';

const HEADERS_TIMEOUT_MS = 30_000;
const GROUNDED_HEADERS_TIMEOUT_MS = 120_000;

const GOOGLE_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'GOOGLE_API_KEY',
    required: true,
    label: 'Google AI Studio API Key',
  },
];

export interface GoogleAdapterConfig extends ProviderAdapterConfig {
  baseUrl?: string;
  skipDiscovery?: boolean;
}

function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') {
    end -= 1;
  }
  return url.slice(0, end);
}

function normalizeGoogleBaseUrl(url: string): string {
  const trimmed = trimTrailingSlashes(url);
  const suffix = `/${GEMINI_API_VERSION_SEGMENT}`;
  return trimmed.toLowerCase().endsWith(suffix.toLowerCase())
    ? trimmed.slice(0, trimmed.length - suffix.length)
    : trimmed;
}

export function createGoogleAdapter(config: GoogleAdapterConfig = {}): ProviderAdapter {
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
  const baseUrl = normalizeGoogleBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
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
        baseUrl: ctx?.baseUrl ? normalizeGoogleBaseUrl(ctx.baseUrl) : baseUrl,
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
      const url = `${baseUrl}/${GEMINI_API_VERSION_SEGMENT}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;

      const hasServerSideTools = (req.rawVendorTools?.length ?? 0) > 0;
      const headersTimeoutMs = hasServerSideTools
        ? GROUNDED_HEADERS_TIMEOUT_MS
        : HEADERS_TIMEOUT_MS;

      let res: Response;
      try {
        const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(headersTimeoutMs)]);
        res = await fetchFn(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': config.apiKey,
          },
          body: JSON.stringify(body),
          signal: combinedSignal,
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
