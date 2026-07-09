import 'server-only';

import { getOptionalEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { validateBaseUrl, ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/llm-runtime';
import { createAnthropicAdapter } from '@agiworkforce/providers-anthropic';
import { createGoogleAdapter } from '@agiworkforce/providers-google';
import { createOpenAIAdapter } from '@agiworkforce/providers-openai';
import { createGroqAdapter } from '@agiworkforce/providers-groq';
import { createMistralAdapter } from '@agiworkforce/providers-mistral';
import { createMoonshotAdapter } from '@agiworkforce/providers-moonshot';
import { createZhipuAdapter } from '@agiworkforce/providers-zhipu';
import { createQwenAdapter } from '@agiworkforce/providers-qwen';
import { createOpenRouterAdapter } from '@agiworkforce/providers-openrouter';
import { createDeepSeekAdapter } from '@agiworkforce/providers-deepseek';
import { createXAIAdapter } from '@agiworkforce/providers-xai';
import { createPerplexityAdapter } from '@agiworkforce/providers-perplexity';
import {
  getModelMetadataById,
  normalizeModelId,
  detectProviderFromModelId,
} from '@agiworkforce/types';
import type { ProviderAdapter, StreamChunk } from '@agiworkforce/types';

/**
 * Server-managed-key `ProviderAdapter` construction, shared by web routes
 * that call an LLM provider with AGI's OWN API key (restructure Wave 2, task
 * #34's "6 remaining importers" batch -- mission, completion,
 * settings/test-provider). Generalizes the env-read + SSRF-validate +
 * construct mechanic `apps/app/api/llm/v1/chat/completions/lib/
 * adapter-factory.ts` already established per-provider for that route.
 *
 * NOT reused by the v1 chat-completions route itself: its Anthropic builder
 * threads per-request prompt-cache config derived from that route's own
 * `ProcessedRequest`, which no caller here has -- unifying them would force
 * either a fake `ProcessedRequest` or a behavior change on that route's
 * already byte-verified path. This function always builds with cache-control
 * left at the adapter's own default instead.
 *
 * Trust boundary: this ONLY reads server env vars (`{PREFIX}_API_KEY`, the
 * same vars the legacy `LLMProviderFactory` reads for the managed-cloud
 * tier). It never accepts a caller-supplied key. BYOK (user-supplied key)
 * construction is a separate, explicit code path -- do not route BYOK
 * requests through this function.
 */

const PROVIDER_ENV_PREFIX: Readonly<Record<string, string>> = {
  anthropic: 'ANTHROPIC',
  google: 'GOOGLE',
  openai: 'OPENAI',
  groq: 'GROQ',
  mistral: 'MISTRAL',
  moonshot: 'MOONSHOT',
  zhipu: 'ZHIPU',
  qwen: 'QWEN',
  openrouter: 'OPENROUTER',
  deepseek: 'DEEPSEEK',
  xai: 'XAI',
  perplexity: 'PERPLEXITY',
};

type AdapterCreator = (config: { apiKey: string; baseUrl?: string }) => ProviderAdapter;

/**
 * `useResponsesApi: false` is REQUIRED for OpenAI here, matching
 * `adapter-factory.ts`'s `buildOpenAIAdapter`: without it, `createOpenAIAdapter`
 * defaults to routing catalog-known models with tool/vision/thinking
 * capabilities through the Responses API, which none of this function's
 * callers (mission, completion, test-provider) expect.
 */
const PROVIDER_CREATORS: Readonly<Record<string, AdapterCreator>> = {
  anthropic: createAnthropicAdapter,
  google: createGoogleAdapter,
  openai: (config) => createOpenAIAdapter({ ...config, useResponsesApi: false }),
  groq: createGroqAdapter,
  mistral: createMistralAdapter,
  moonshot: createMoonshotAdapter,
  zhipu: createZhipuAdapter,
  qwen: createQwenAdapter,
  openrouter: createOpenRouterAdapter,
  deepseek: createDeepSeekAdapter,
  xai: createXAIAdapter,
  perplexity: createPerplexityAdapter,
};

/** All provider ids this service can construct an adapter for. */
export const SUPPORTED_SERVER_PROVIDER_IDS: readonly string[] = Object.keys(PROVIDER_ENV_PREFIX);

/**
 * Map a catalog/internal model id to the vendor-specific API model string.
 * The canonical adapter path (`ProviderAdapter.stream`) sends `ChatRequest.model`
 * to the wire VERBATIM -- unlike the legacy `LLMProviderFactory.sendRequest`,
 * which called this same mapping internally before dispatch. Callers building
 * a `ChatRequest` directly (not via the v1 route's `toCanonicalChatRequest`,
 * which already does this) MUST map the model id themselves first or the
 * request goes out with an id the vendor doesn't recognize. Same logic as
 * `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts`'s
 * private `toApiModelId` (kept as a small local reimplementation there rather
 * than importing this, to avoid adding a cross-route dependency to that
 * route's already byte-verified path).
 */
export function toApiModelId(modelId: string): string {
  const metadata = getModelMetadataById(modelId);
  const normalized = normalizeModelId(modelId);
  return metadata?.apiModelId ?? normalized ?? modelId;
}

/**
 * Resolve which provider serves a given model id. Byte-for-byte port of
 * `apps/web/lib/llm-providers/factory.ts`'s `LLMProviderFactory.
 * getProviderFromModel` (same catalog lookup, same `open_router` ->
 * `openrouter` normalization, same ordered heuristic fallback chain,
 * same `openai` default) -- that module is being retired (restructure
 * Wave 2, task #34), so this is the replacement for its callers.
 * `detectProviderFromModelId` itself already lives in `@agiworkforce/types`
 * (the legacy function only wrapped it); reused directly, not duplicated.
 */
export function resolveProviderFromModel(model: string): string {
  const catalogProvider = detectProviderFromModelId(model);
  if (catalogProvider) {
    // models.json canonical id is 'open_router'; normalize so this always
    // matches PROVIDER_ENV_PREFIX / PROVIDER_CREATORS' 'openrouter' key.
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
export function buildServerProviderAdapter(providerId: string): ProviderAdapter {
  const envPrefix = PROVIDER_ENV_PREFIX[providerId];
  const create = PROVIDER_CREATORS[providerId];
  if (!envPrefix || !create) {
    throw new Error(`Provider "${providerId}" is not supported.`);
  }

  const apiKey = getOptionalEnv(`${envPrefix}_API_KEY`);
  if (!apiKey) {
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

  return create({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
}
