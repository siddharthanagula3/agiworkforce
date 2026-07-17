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
import type { ProviderAdapter, StreamChunk } from '@agiworkforce/types';

/**
 * Server-managed-key `ProviderAdapter` construction shared by Web routes
 * that call an LLM provider with AGI's own API key. This is the Web owner for
 * environment lookup, base-URL validation, and provider SDK construction.
 *
 * The v1 chat-completions route passes only its derived Anthropic cache policy
 * through `ServerProviderAdapterOptions`; request parsing and routing remain
 * route-owned. Callers cannot replace the managed API key or base URL.
 *
 * Trust boundary: this only reads server environment variables. It never
 * accepts a caller-supplied key. BYOK construction is a separate, explicit
 * code path; do not route BYOK requests through this function.
 */

const SERVER_PROVIDER_CONFIG: Readonly<
  Record<string, { envPrefix: string; adapterId: ProviderAdapterId }>
> = {
  anthropic: { envPrefix: 'ANTHROPIC', adapterId: 'anthropic' },
  google: { envPrefix: 'GOOGLE', adapterId: 'google' },
  openai: { envPrefix: 'OPENAI', adapterId: 'openai' },
  groq: { envPrefix: 'GROQ', adapterId: 'groq' },
  mistral: { envPrefix: 'MISTRAL', adapterId: 'mistral' },
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
};

export interface ServerProviderAdapterOptions {
  /** Request-derived Anthropic prompt-cache policy; credentials remain service-owned. */
  anthropicCache?: Readonly<
    Pick<ProviderAdapterConfigMap['anthropic'], 'enableCacheControl' | 'cacheRetention'>
  >;
}

/** All provider ids this service can construct an adapter for. */
export const SUPPORTED_SERVER_PROVIDER_IDS: readonly string[] = Object.keys(SERVER_PROVIDER_CONFIG);

/**
 * Compatibility alias for Web routes that construct a `ChatRequest` directly.
 * The canonical implementation is owned by `@agiworkforce/provider-protocol`.
 */
export const toApiModelId = toProviderApiModelId;

/**
 * Resolve catalogued models through the shared registry and preserve the
 * ordered compatibility fallback for uncatalogued model IDs. The Web dispatch
 * key remains `openrouter`; construction translates it to the canonical
 * `open_router` adapter ID.
 */
export function resolveProviderFromModel(model: string): string {
  const catalogProvider = detectProviderFromModelId(model);
  if (catalogProvider) {
    // Web chat's historical dispatch key is 'openrouter'; the aggregate
    // factory boundary translates that to the catalog's canonical
    // 'open_router' adapter id only when construction happens.
    if (catalogProvider === 'open_router') return 'openrouter';
    return catalogProvider;
  }

  const modelLower = model.toLowerCase();
  if (modelLower.includes('gpt-')) return 'openai';
  if (modelLower.includes('claude-')) return 'anthropic';
  if (modelLower.includes('gemini-')) return 'google';
  if (modelLower.includes('grok-')) return 'xai';
  if (modelLower.includes('qwen')) return 'qwen';
  if (modelLower.includes('kimi')) return 'moonshot';
  if (modelLower.includes('deepseek')) return 'deepseek';
  if (modelLower.includes('sonar')) return 'perplexity';
  if (modelLower.includes('glm-')) return 'zhipu';
  if (
    modelLower.includes('mistral') ||
    modelLower.includes('codestral') ||
    modelLower.includes('pixtral')
  ) {
    return 'mistral';
  }
  // Bare llama model IDs (no slash prefix) route to groq by convention.
  if (modelLower.startsWith('llama-')) return 'groq';

  // Default to OpenAI.
  return 'openai';
}

/**
 * Provider-agnostic upstream error mapper for callers that dispatch to a
 * DYNAMICALLY resolved provider (via `resolveProviderFromModel`) rather than
 * a hardcoded one -- so a provider-branded mapper like the v1 route's
 * `toUpstreamError` (Anthropic-only wording) would mislabel the error if the
 * resolved provider ever isn't the one its name implies. Keeps the upstream
 * status code, since callers may classify on it (e.g.
 * settings/test-provider's 401/403/429 detection), while genericizing the
 * provider name in the message text.
 */
export function toGenericUpstreamError(
  providerId: string,
  chunk: Extract<StreamChunk, { type: 'error' }>,
): Error {
  const status = chunk.code ? Number(chunk.code) : undefined;
  const label = status !== undefined && Number.isFinite(status) ? `(${status})` : '(unknown)';
  return new Error(`${providerId} API error ${label}: ${chunk.message}`);
}

/**
 * Build a `ProviderAdapter` using AGI's server-side API key for `providerId`.
 * Throws a descriptive `Error` (never returns null/undefined) if the
 * provider id is unrecognized or its `{PREFIX}_API_KEY` env var is unset --
 * message text matches `adapter-factory.ts`'s existing per-provider builders
 * exactly, since some callers (e.g. settings/test-provider's error
 * classifier) pattern-match on it.
 */
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
  if (providerId === 'openai') {
    return createProviderAdapter('openai', { ...baseConfig, useResponsesApi: false });
  }

  return createProviderAdapter(adapterId, baseConfig);
}
