/**
 * @agiworkforce/providers-vercel-gateway
 *
 * Vercel AI Gateway adapter. The gateway exposes an OpenAI-compatible Chat
 * Completions endpoint at `https://ai-gateway.vercel.sh/v1` and fans out to
 * upstream vendors itself, so model ids here are gateway slugs rather than any
 * single vendor's ids.
 *
 * @packageDocumentation
 */

import OpenAI from 'openai';
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
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';
import {
  ALLOWED_MANAGED_PROVIDER_HOSTS,
  classifyError,
  resolveValidatedBaseUrl,
  withStreamIdleWatchdog,
} from '@agiworkforce/provider-runtime';
import { translateChatRequest, translateOpenAIStream } from '@agiworkforce/providers-openai';

import { VERCEL_GATEWAY_MODEL_CATALOG } from './catalog';
import {
  applyVercelGatewayProviderOptions,
  type VercelGatewayProviderOptions,
} from './provider-options';
import { createVercelGatewayUsageNormalizer } from './usage';

const VERCEL_GATEWAY_PROVIDER_ID = 'vercel_gateway';
const VERCEL_GATEWAY_LABEL = 'Vercel AI Gateway';
const VERCEL_GATEWAY_API_KEY_ENV_VAR = 'VERCEL_GATEWAY_API_KEY';
const VERCEL_GATEWAY_DEFAULT_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

const VERCEL_GATEWAY_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: VERCEL_GATEWAY_API_KEY_ENV_VAR,
    required: true,
    label: 'Vercel AI Gateway API Key',
  },
];

export interface VercelGatewayAdapterConfig extends ProviderAdapterConfig {
  skipDiscovery?: boolean;
  additionalAllowedBaseUrlHosts?: readonly string[];
  providerOptions?: VercelGatewayProviderOptions;
}

export function createVercelGatewayAdapter(
  config: VercelGatewayAdapterConfig = {},
): ProviderAdapter {
  const { url: baseUrl } = resolveValidatedBaseUrl(
    config.baseUrl,
    VERCEL_GATEWAY_DEFAULT_BASE_URL,
    {
      allowedHosts: new Set([
        ...ALLOWED_MANAGED_PROVIDER_HOSTS,
        ...(config.additionalAllowedBaseUrlHosts ?? []),
      ]),
    },
  );

  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: VERCEL_GATEWAY_PROVIDER_ID,
    label: VERCEL_GATEWAY_LABEL,
    auth: VERCEL_GATEWAY_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...VERCEL_GATEWAY_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = VERCEL_GATEWAY_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: VERCEL_GATEWAY_PROVIDER_ID });
          }
        }
        return out;
      } catch {
        return [...VERCEL_GATEWAY_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: VERCEL_GATEWAY_PROVIDER_ID,
        baseUrl,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: VERCEL_GATEWAY_PROVIDER_ID,
      });

      applyVercelGatewayProviderOptions(params, config.providerOptions, req.metadata);

      params.stream_options = { include_usage: true };

      const normalizer = createVercelGatewayUsageNormalizer();

      try {
        const sdkStream = await sdk.chat.completions.create(
          params as unknown as Parameters<typeof sdk.chat.completions.create>[0],
          { signal },
        );
        const normalizedSource = normalizer.normalizeSource(
          sdkStream as unknown as Parameters<typeof normalizer.normalizeSource>[0],
        );
        const translated = translateOpenAIStream(normalizedSource);
        const enriched = normalizer.enrichOutput(translated);
        const watched = withStreamIdleWatchdog(enriched);
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

export const vercelGatewayAdapterFactory: ProviderAdapterFactory = (config) =>
  createVercelGatewayAdapter(config as VercelGatewayAdapterConfig);

export { VERCEL_GATEWAY_MODEL_CATALOG } from './catalog';
export {
  applyVercelGatewayProviderOptions,
  type VercelGatewayProviderOptions,
  type VercelGatewaySortMetric,
  type VercelGatewayCachingMode,
} from './provider-options';
export { createVercelGatewayUsageNormalizer, type VercelGatewayUsageNormalizer } from './usage';
