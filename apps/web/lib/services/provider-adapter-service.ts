import 'server-only';

import { getOptionalEnv } from '@shared/utils/env';
import { logger } from '@/lib/logger';
import { toProviderApiModelId } from '@agiworkforce/provider-protocol';
import { validateBaseUrl, ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/provider-runtime';
import {
  createProviderAdapter,
  type ProviderAdapterConfigMap,
  type ProviderAdapterId,
} from '@agiworkforce/providers-factory';
import { detectProviderFromModelId } from '@agiworkforce/types';
import { isRoutedViaOpenRouter, openRouterSlugFor } from './aggregator-routing';
import type { ProviderAdapter, StreamChunk } from '@agiworkforce/types';

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
};

const PROVIDER_API_KEY_ENV_KEYS: Readonly<Record<string, readonly string[]>> = {
  google: ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'],
  qwen: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
};

export interface ServerProviderAdapterOptions {
  anthropicCache?: Readonly<
    Pick<ProviderAdapterConfigMap['anthropic'], 'enableCacheControl' | 'cacheRetention'>
  >;
  openRouterCacheRetention?: 'none' | 'short' | 'long';
}

export const SUPPORTED_SERVER_PROVIDER_IDS: readonly string[] = Object.keys(SERVER_PROVIDER_CONFIG);

export const toApiModelId = toProviderApiModelId;

export function resolveProviderFromModel(model: string): string {
  const catalogProvider = detectProviderFromModelId(model);
  if (catalogProvider) {
    if (catalogProvider === 'open_router') return 'openrouter';
    if (
      isRoutedViaOpenRouter(catalogProvider) &&
      openRouterSlugFor(toProviderApiModelId(model)) !== undefined
    ) {
      return 'openrouter';
    }
    return catalogProvider;
  }

  throw new Error('Model is not registered in the canonical model catalog');
}

export function toGenericUpstreamError(
  providerId: string,
  chunk: Extract<StreamChunk, { type: 'error' }>,
): Error {
  const status = chunk.code ? Number(chunk.code) : undefined;
  const label = status !== undefined && Number.isFinite(status) ? `(${status})` : '(unknown)';
  return new Error(`${providerId} API error ${label}: ${chunk.message}`);
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

  const apiKeyEnvKeys = PROVIDER_API_KEY_ENV_KEYS[providerId] ?? [`${envPrefix}_API_KEY`];
  let apiKey: string | undefined;
  for (const envKey of apiKeyEnvKeys) {
    apiKey = getOptionalEnv(envKey);
    if (apiKey) break;
  }
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
