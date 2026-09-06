/**
 * Shared constructor for OpenAI-compatible provider adapters.
 *
 * A vendor that ships an OpenAI-shaped Chat Completions endpoint needs no
 * bespoke transport: `detectOpenAICompletionsCompat` derives the payload
 * dialect from the base URL, `translateChatRequest` / `translateOpenAIStream`
 * carry the wire format, and `classifyError` normalises failures. What remains
 * per vendor is identity (id, label, auth env var), its default endpoint and
 * its curated catalog, the four fields `OpenAICompatAdapterSpec` asks for.
 *
 * Vendors whose endpoint deviates from the OpenAI shape (extra headers,
 * response rewriting, vendor-only request fields) keep their own hand-written
 * adapter; this helper deliberately exposes no hooks for that.
 *
 * @packageDocumentation
 */

import OpenAI from 'openai';
import type {
  AuthMethod,
  ChatRequest,
  ModelInfo,
  Provider,
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderCatalogContext,
  StreamChunk,
} from '@agiworkforce/types';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';
import { classifyError, withStreamIdleWatchdog } from '@agiworkforce/provider-runtime';

import { translateChatRequest } from './translate';
import { translateOpenAIStream } from './stream';
import type { OpenAIChatCompletionChunk } from './types';

export interface OpenAICompatAdapterConfig extends ProviderAdapterConfig {
  skipDiscovery?: boolean;
  extraHeaders?: Record<string, string>;
  extraBody?: Readonly<Record<string, unknown>>;
}

export interface OpenAICompatAdapterSpec {
  id: Provider;
  label: string;
  apiKeyEnvVar: string;
  apiKeyLabel: string;
  /**
   * Omitted by gateways whose endpoint embeds account-scoped path segments and
   * therefore has no serviceable default. `baseUrl` is then mandatory, and a
   * caller that omits it gets a construction error rather than an adapter
   * silently pointed at the `openai` SDK's own default host.
   */
  defaultBaseUrl?: string;
  baseUrlEnvVar?: string;
  catalog: readonly ModelInfo[];
}

function resolveBaseUrl(spec: OpenAICompatAdapterSpec, config: OpenAICompatAdapterConfig): string {
  const resolved = config.baseUrl ?? spec.defaultBaseUrl;
  if (!resolved) {
    const source = spec.baseUrlEnvVar
      ? `server callers source it from the ${spec.baseUrlEnvVar} environment variable`
      : 'no default endpoint is available for this provider';
    throw new Error(`Provider "${spec.id}" requires an explicit baseUrl (${source}).`);
  }
  return resolved;
}

export function createOpenAICompatAdapter(
  spec: OpenAICompatAdapterSpec,
  config: OpenAICompatAdapterConfig = {},
): ProviderAdapter {
  const baseUrl = resolveBaseUrl(spec, config);
  const authMethods: readonly AuthMethod[] = [
    {
      kind: 'api-key',
      envVar: spec.apiKeyEnvVar,
      required: true,
      label: spec.apiKeyLabel,
    },
  ];

  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.extraHeaders && Object.keys(config.extraHeaders).length > 0
      ? { defaultHeaders: config.extraHeaders }
      : {}),
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: spec.id,
    label: spec.label,
    auth: authMethods,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...spec.catalog];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = spec.catalog
          .filter((m) => ids.size === 0 || ids.has(m.id))
          .map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: spec.id });
          }
        }
        return out;
      } catch {
        return [...spec.catalog];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: spec.id,
        baseUrl,
        id: req.model,
      });

      const params = {
        ...translateChatRequest(req, {
          compat: detected.defaults,
          provider: spec.id,
        }),
        ...(config.extraBody ?? {}),
      };

      try {
        const sdkStream = await sdk.chat.completions.create(
          params as unknown as Parameters<typeof sdk.chat.completions.create>[0],
          { signal },
        );
        const watched = withStreamIdleWatchdog(
          translateOpenAIStream(sdkStream as unknown as AsyncIterable<OpenAIChatCompletionChunk>),
        );
        for await (const chunk of watched) {
          yield chunk;
        }
      } catch (err) {
        const classified = classifyError(err);
        yield {
          type: 'error',
          message: classified.message,
          ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
          retryable: classified.retryable,
          ...(classified.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: classified.retryAfterSeconds }
            : {}),
        };
        yield { type: 'stop', reason: 'error' };
      }
    },
  };
}
