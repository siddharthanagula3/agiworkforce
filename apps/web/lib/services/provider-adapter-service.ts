import 'server-only';

import { getOptionalEnv } from '@shared/utils/env';
import { logger } from '@/lib/logger';
import { toProviderApiModelId } from '@agiworkforce/provider-protocol';
import { validateBaseUrl, ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/provider-runtime';
import { gatewayRoutesEnabled, listCredentialedGatewayProviderIds } from './gateway-routing';
import {
  createProviderAdapter,
  type ProviderAdapterConfigMap,
  type ProviderAdapterId,
} from '@agiworkforce/providers-factory';
import { getModelMetadataById, listProtocolRoutes } from '@agiworkforce/types';
import {
  dispatchProviderForRoute,
  isManagedOpenRouterRoute,
  openRouterSlugFor,
  validateRouteSelection,
} from './aggregator-routing';
import type {
  HarnessProtocol,
  ProtocolHarness,
  ProviderAdapter,
  StreamChunk,
} from '@agiworkforce/types';

const SERVER_PROVIDER_CONFIG: Readonly<
  Record<string, { envPrefix: string; adapterId: ProviderAdapterId }>
> = {
  anthropic: { envPrefix: 'ANTHROPIC', adapterId: 'anthropic' },
  google: { envPrefix: 'GOOGLE', adapterId: 'google' },
  openai: { envPrefix: 'OPENAI', adapterId: 'openai' },
  minimax: { envPrefix: 'MINIMAX', adapterId: 'minimax' },
  moonshot: { envPrefix: 'MOONSHOT', adapterId: 'moonshot' },
  zhipu: { envPrefix: 'ZHIPU', adapterId: 'zhipu' },
  qwen: { envPrefix: 'QWEN', adapterId: 'qwen' },
  openrouter: { envPrefix: 'OPENROUTER', adapterId: 'open_router' },
  deepseek: { envPrefix: 'DEEPSEEK', adapterId: 'deepseek' },
  xai: { envPrefix: 'XAI', adapterId: 'xai' },
  perplexity: { envPrefix: 'PERPLEXITY', adapterId: 'perplexity' },
  groq: { envPrefix: 'GROQ', adapterId: 'groq' },
  nvidia_nim: { envPrefix: 'NVIDIA_NIM', adapterId: 'nvidia_nim' },
  workers_ai: { envPrefix: 'WORKERS_AI', adapterId: 'workers_ai' },
  vercel_gateway: { envPrefix: 'VERCEL_GATEWAY', adapterId: 'vercel_gateway' },
};

const PROVIDER_API_KEY_ENV_KEYS: Readonly<Record<string, readonly string[]>> = {
  google: ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'],
  qwen: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
  nvidia_nim: ['NVIDIA_NIM_API_KEY', 'NVIDIA_API_KEY'],
  workers_ai: ['WORKERS_AI_API_KEY', 'CLOUDFLARE_API_TOKEN'],
  // A static key wins over the OIDC token, matching @ai-sdk/gateway's own
  // precedence: VERCEL_OIDC_TOKEN is provisioned by `vercel link` and rotates,
  // so it is the development fallback, not the server default.
  vercel_gateway: [
    'VERCEL_GATEWAY_API_KEY',
    'VERCEL_AI_GATEWAY_API_KEY',
    'AI_GATEWAY_API_KEY',
    'VERCEL_OIDC_TOKEN',
  ],
};

const PROTOCOL_ROUTE_HARNESSES: ReadonlyMap<string, ProtocolHarness> = (() => {
  const byProvider = new Map<string, ProtocolHarness>();
  for (const route of listProtocolRoutes()) {
    const existing = byProvider.get(route.provider);
    if (existing && existing.harnessId !== route.harnessId) {
      throw new Error(
        `Provider "${route.provider}" declares two protocol harnesses (${existing.harnessId}, ${route.harnessId})`,
      );
    }
    byProvider.set(route.provider, route);
  }
  return byProvider;
})();

export const PROTOCOL_ROUTE_PROVIDER_IDS: readonly string[] = [...PROTOCOL_ROUTE_HARNESSES.keys()];

export interface ServerProviderAdapterOptions {
  anthropicCache?: Readonly<
    Pick<ProviderAdapterConfigMap['anthropic'], 'enableCacheControl' | 'cacheRetention'>
  >;
  openRouterCacheRetention?: 'none' | 'short' | 'long';
}

export const SUPPORTED_SERVER_PROVIDER_IDS: readonly string[] = Object.keys(SERVER_PROVIDER_CONFIG);

export const toApiModelId = toProviderApiModelId;

function resolveServerProviderApiKey(providerId: string): string | undefined {
  const envPrefix = SERVER_PROVIDER_CONFIG[providerId]?.envPrefix;
  if (!envPrefix) return undefined;
  const apiKeyEnvKeys = PROVIDER_API_KEY_ENV_KEYS[providerId] ?? [`${envPrefix}_API_KEY`];
  for (const envKey of apiKeyEnvKeys) {
    const apiKey = getOptionalEnv(envKey);
    if (apiKey) return apiKey;
  }
  return undefined;
}

export function hasServerProviderKey(providerId: string): boolean {
  return resolveServerProviderApiKey(providerId) !== undefined;
}

export function listAvailableManagedProviderIds(): ReadonlySet<string> {
  const available = new Set<string>();
  for (const [providerId, config] of Object.entries(SERVER_PROVIDER_CONFIG)) {
    if (hasServerProviderKey(providerId)) available.add(config.adapterId);
  }
  if (gatewayRoutesEnabled()) {
    for (const providerId of listCredentialedGatewayProviderIds()) available.add(providerId);
  }
  return available;
}

const DEFAULT_ROUTE_SELECTION_TRUST_MODE = 'managed_cloud';

export interface RouteSelectionContext {
  trustMode?: string;
  hasUserProviderKey?: boolean;
}

export function resolveProviderFromModel(
  model: string,
  selectedRouteId?: string,
  routeContext: RouteSelectionContext = {},
): string {
  const metadata = getModelMetadataById(model);
  if (!metadata) {
    throw new Error('Model is not registered in the canonical model catalog');
  }
  const catalogProvider = metadata.provider;
  const apiModelId = toProviderApiModelId(model);
  const openRouterFallbackAvailable =
    !hasServerProviderKey(catalogProvider) &&
    isManagedOpenRouterRoute(apiModelId) &&
    openRouterSlugFor(apiModelId) !== undefined;

  if (selectedRouteId) {
    const validation = validateRouteSelection(selectedRouteId, {
      modelId: metadata.id,
      trustMode: routeContext.trustMode ?? DEFAULT_ROUTE_SELECTION_TRUST_MODE,
      hasUserProviderKey: routeContext.hasUserProviderKey ?? false,
    });
    if (validation.ok) {
      const selectedProvider = dispatchProviderForRoute(selectedRouteId);
      const selectedRouteIsUndispatchableDirect =
        selectedProvider === catalogProvider && openRouterFallbackAvailable;
      if (selectedProvider && !selectedRouteIsUndispatchableDirect) return selectedProvider;
    } else {
      logger.warn(
        { routeId: selectedRouteId, model, reason: validation.reason },
        'Rejected selected route; falling back to default route resolution',
      );
    }
  }

  if (catalogProvider === 'open_router') return 'openrouter';

  if (openRouterFallbackAvailable) {
    return 'openrouter';
  }

  return catalogProvider;
}

export function toGenericUpstreamError(
  providerId: string,
  chunk: Extract<StreamChunk, { type: 'error' }>,
): Error {
  const status = chunk.code ? Number(chunk.code) : undefined;
  const label = status !== undefined && Number.isFinite(status) ? `(${status})` : '(unknown)';
  return new Error(`${providerId} API error ${label}: ${chunk.message}`);
}

function resolveProtocolRouteBaseUrl(harness: ProtocolHarness): string {
  const validated = validateBaseUrl(harness.baseUrl, {
    allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
  });
  if (!validated.ok) {
    throw new Error(
      `Harness "${harness.harnessId}" declares base URL host ${validated.hostname ?? harness.baseUrl}, which the managed egress allowlist refuses (${validated.reason}).`,
    );
  }
  return validated.url;
}

const PROTOCOL_ROUTE_BUILDERS: Readonly<
  Record<
    Exclude<HarnessProtocol, 'provider_native'>,
    (
      harness: ProtocolHarness,
      apiKey: string,
      baseUrl: string,
      options: ServerProviderAdapterOptions,
    ) => ProviderAdapter
  >
> = {
  openai_chat: (harness, apiKey, baseUrl) =>
    createProviderAdapter('openai_compat', {
      apiKey,
      baseUrl,
      providerId: harness.provider,
      label: harness.provider,
      apiKeyEnvVar: harness.apiKeyEnv,
      skipDiscovery: true,
    }),
  openai_responses: (_harness, apiKey, baseUrl) =>
    createProviderAdapter('openai', { apiKey, baseUrl }),
  anthropic_messages: (_harness, apiKey, baseUrl, options) =>
    createProviderAdapter('anthropic', { apiKey, baseUrl, ...options.anthropicCache }),
  gemini_native: (_harness, apiKey, baseUrl) =>
    createProviderAdapter('google', { apiKey, baseUrl }),
};

export function getProtocolRouteHarness(providerId: string): ProtocolHarness | null {
  return PROTOCOL_ROUTE_HARNESSES.get(providerId) ?? null;
}

export function buildProtocolRouteAdapter(
  providerId: string,
  options: ServerProviderAdapterOptions = {},
): ProviderAdapter {
  const harness = PROTOCOL_ROUTE_HARNESSES.get(providerId);
  if (!harness) {
    throw new Error(`Provider "${providerId}" declares no protocol route.`);
  }
  const apiKey = getOptionalEnv(harness.apiKeyEnv);
  if (!apiKey) {
    throw new Error(
      `Provider "${providerId}" is not configured. ` +
        `Please ensure the ${harness.apiKeyEnv} environment variable is set. ` +
        'Check your .env.local file or deployment environment variables.',
    );
  }
  return PROTOCOL_ROUTE_BUILDERS[harness.protocol](
    harness,
    apiKey,
    resolveProtocolRouteBaseUrl(harness),
    options,
  );
}

export function buildServerProviderAdapter(
  providerId: string,
  options: ServerProviderAdapterOptions = {},
): ProviderAdapter {
  const providerConfig = SERVER_PROVIDER_CONFIG[providerId];
  if (!providerConfig) {
    throw new Error(`Provider "${providerId}" is not supported.`);
  }
  const { adapterId, envPrefix } = providerConfig;

  const apiKey = resolveServerProviderApiKey(providerId);
  if (!apiKey) {
    if (providerId === 'google') {
      throw new Error(
        'Provider "google" is not configured. ' +
          'Please set GOOGLE_API_KEY (or GEMINI_API_KEY). ' +
          'Check your .env.local file or deployment environment variables.',
      );
    }
    throw new Error(
      `Provider "${providerId}" is not configured. ` +
        `Please ensure the ${envPrefix}_API_KEY environment variable is set. ` +
        'Check your .env.local file or deployment environment variables.',
    );
  }

  let baseUrl: string | undefined;
  const candidateBaseUrl = getOptionalEnv(`${envPrefix}_BASE_URL`);
  if (candidateBaseUrl) {
    const validated = validateBaseUrl(candidateBaseUrl, {
      allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
    });
    if (validated.ok) {
      baseUrl = validated.url;
    } else {
      logger.warn(
        {
          providerId,
          envKey: `${envPrefix}_BASE_URL`,
          reason: validated.reason,
          host: validated.hostname,
        },
        'Refusing *_BASE_URL override pointing to a non-allowlisted host (potential SSRF)',
      );
    }
  }

  const baseConfig = { apiKey, ...(baseUrl ? { baseUrl } : {}) };
  if (providerId === 'anthropic' && options.anthropicCache) {
    return createProviderAdapter('anthropic', { ...baseConfig, ...options.anthropicCache });
  }
  if (adapterId === 'open_router' && options.openRouterCacheRetention !== undefined) {
    return createProviderAdapter('open_router', {
      ...baseConfig,
      anthropicCacheRetention: options.openRouterCacheRetention,
    });
  }
  if (providerId === 'openai') {
    return createProviderAdapter('openai', {
      ...baseConfig,
      onResponsesDiagnostics(responses) {
        logger.info({ providerId: 'openai', responses }, 'OpenAI Responses request completed');
      },
    });
  }
  if (providerId === 'qwen') {
    const fallbackRaw = getOptionalEnv('QWEN_FALLBACK_BASE_URL');
    if (fallbackRaw) {
      const validatedFallback = validateBaseUrl(fallbackRaw, {
        allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
      });
      if (validatedFallback.ok) {
        const fallbackKey = getOptionalEnv('QWEN_FALLBACK_API_KEY');
        return createProviderAdapter('qwen', {
          ...baseConfig,
          fallbackEndpoints: [
            { baseUrl: validatedFallback.url, ...(fallbackKey ? { apiKey: fallbackKey } : {}) },
          ],
        });
      }
      logger.warn(
        {
          providerId,
          envKey: 'QWEN_FALLBACK_BASE_URL',
          reason: validatedFallback.reason,
          host: validatedFallback.hostname,
        },
        'Refusing QWEN_FALLBACK_BASE_URL override pointing to a non-allowlisted host (potential SSRF)',
      );
    }
  }
  return createProviderAdapter(adapterId, baseConfig);
}
