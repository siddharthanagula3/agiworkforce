/**
 * @agiworkforce/providers-ollama
 *
 * Ollama provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Talks directly to the Ollama HTTP API — no vendor
 * SDK required (Ollama's wire is small and stable).
 *
 * Default base URL: `http://localhost:11434`. Override via
 * `OllamaAdapterConfig.baseUrl` (e.g., for a remote machine on the LAN).
 *
 * Auth: typically none (local), but supports an optional bearer token for
 * private deployments fronted by reverse proxies.
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
import { classifyError, withStreamIdleWatchdog } from '@agiworkforce/llm-runtime';

import { fetchOllamaCatalog } from './catalog';
import { translateChatRequest } from './translate';
import { parseOllamaStream, translateOllamaStream } from './stream';

const DEFAULT_BASE_URL = 'http://localhost:11434';

const OLLAMA_AUTH_METHODS: readonly AuthMethod[] = [
  { kind: 'none', label: 'Local Ollama (no auth)' },
  {
    kind: 'api-key',
    envVar: 'OLLAMA_API_KEY',
    required: false,
    label: 'Bearer Token (proxied deployments)',
  },
];

export interface OllamaAdapterConfig extends ProviderAdapterConfig {
  /** Override for self-hosted/remote Ollama daemons. */
  baseUrl?: string;
  /** Optional model context window override (forces num_ctx on every request). */
  forceContextWindow?: number;
  /** Keep model loaded for N seconds (Ollama `keep_alive`). */
  keepAliveSeconds?: number;
}

export function createOllamaAdapter(config: OllamaAdapterConfig = {}): ProviderAdapter {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const fetchFn = config.fetch ?? fetch;

  return {
    id: 'ollama',
    label: 'Ollama (local)',
    auth: OLLAMA_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      return fetchOllamaCatalog({
        baseUrl: ctx?.baseUrl ?? baseUrl,
        fetch: ctx?.fetch ?? fetchFn,
        ...(ctx?.signal ? { signal: ctx.signal } : {}),
      });
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const translated = translateChatRequest(req);

      // Apply optional context override and keep_alive.
      if (config.forceContextWindow !== undefined) {
        translated.options = {
          ...(translated.options ?? {}),
          num_ctx: config.forceContextWindow,
        };
      }
      if (config.keepAliveSeconds !== undefined) {
        translated.keep_alive = `${config.keepAliveSeconds}s`;
      }

      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      if (config.apiKey) {
        headers['authorization'] = `Bearer ${config.apiKey}`;
      }

      let res: Response;
      try {
        res = await fetchFn(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify(translated),
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
        const synthetic = {
          status: res.status,
          message: `Ollama responded ${res.status}: ${text || res.statusText}`,
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
        yield { type: 'error', message: 'Ollama response has no body' };
        yield { type: 'stop', reason: 'error' };
        return;
      }

      const watched = withStreamIdleWatchdog(translateOllamaStream(parseOllamaStream(res.body)));
      for await (const chunk of watched) {
        yield chunk;
      }
    },
  };
}

export const ollamaAdapterFactory: ProviderAdapterFactory = (config) =>
  createOllamaAdapter(config as OllamaAdapterConfig);

export { fetchOllamaCatalog } from './catalog';
export { translateChatRequest } from './translate';
export { parseOllamaStream, translateOllamaStream } from './stream';
export type {
  OllamaChatMessage,
  OllamaChatRequest,
  OllamaChatStreamChunk,
  OllamaTagsResponse,
  OllamaTool,
} from './types';
