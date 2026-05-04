/**
 * Provider request capability resolution (pure, plugin-manifest-free).
 *
 * Simplified port of OpenClaw `src/agents/provider-attribution.ts` (806 LOC).
 * The original dynamically scans plugin manifests at runtime; this version is
 * a single pure function over a hardcoded endpoint/provider table — sufficient
 * for the providers AGI Workforce ships (10+) without the plugin runtime
 * coupling.
 *
 * Used by:
 *   - `anthropic-payload-policy.ts` — to gate `service_tier` on the
 *     anthropic-public + anthropic-messages combination.
 *   - `openai-completions-compat.ts` — to derive max_tokens field, store
 *     support, reasoning format per endpoint family.
 *
 * Ported from OpenClaw (MIT, Peter Steinberger). See THIRD_PARTY_LICENSES.md
 * at repo root for full attribution.
 */

import { readStringValue, normalizeOptionalLowercaseString } from './lib/string-utils';
import { resolveBundledOpenAIResponsesEndpointClass } from './openai-responses-payload-policy';

export type ProviderRequestTransport = 'stream' | 'websocket' | 'http' | 'media-understanding';
export type ProviderRequestCapability = 'llm' | 'audio' | 'image' | 'video' | 'other';
export type ProviderEndpointClass =
  | 'default'
  | 'anthropic-public'
  | 'cerebras-native'
  | 'chutes-native'
  | 'deepseek-native'
  | 'github-copilot-native'
  | 'groq-native'
  | 'mistral-public'
  | 'moonshot-native'
  | 'modelstudio-native'
  | 'openai-public'
  | 'openai-codex'
  | 'opencode-native'
  | 'azure-openai'
  | 'openrouter'
  | 'xai-native'
  | 'zai-native'
  | 'google-generative-ai'
  | 'google-vertex'
  | 'local'
  | 'custom'
  | 'invalid';

export interface ProviderRequestCapabilitiesInput {
  provider?: string | null;
  api?: string | null;
  baseUrl?: string | null;
  transport?: ProviderRequestTransport;
  capability?: ProviderRequestCapability;
  modelId?: string | null;
  /** Per-model compat flags from the model catalog. */
  compat?: unknown;
}

export interface ProviderRequestCapabilities {
  provider?: string;
  endpointClass: ProviderEndpointClass;
  knownProviderFamily: string;
  usesConfiguredBaseUrl: boolean;
  usesKnownNativeOpenAIEndpoint: boolean;
  usesKnownNativeOpenAIRoute: boolean;
  usesExplicitProxyLikeEndpoint: boolean;
  isKnownNativeEndpoint: boolean;
  allowsOpenAIServiceTier: boolean;
  allowsAnthropicServiceTier: boolean;
  supportsResponsesStoreField: boolean;
  allowsResponsesStore: boolean;
  shouldStripResponsesPromptCache: boolean;
  supportsNativeStreamingUsageCompat: boolean;
  supportsOpenAICompletionsStreamingUsageCompat: boolean;
}

const OPENAI_RESPONSES_APIS = new Set([
  'openai-responses',
  'azure-openai-responses',
  'openai-codex-responses',
]);
const OPENAI_RESPONSES_PROVIDERS = new Set(['openai', 'azure-openai', 'azure-openai-responses']);

function readCompatBoolean(
  compat: unknown,
  key: 'supportsStore' | 'supportsPromptCacheKey',
): boolean | undefined {
  if (!compat || typeof compat !== 'object') {
    return undefined;
  }
  const value = (compat as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

function resolveKnownProviderFamily(provider: string | undefined): string {
  switch (provider) {
    case 'openai':
    case 'openai-codex':
    case 'azure-openai':
    case 'azure-openai-responses':
      return 'openai-family';
    case 'anthropic':
    case 'anthropic-vertex':
    case 'anthropic-bedrock':
      return 'anthropic-family';
    case 'google':
    case 'google-vertex':
      return 'google-family';
    case 'mistral':
      return 'mistral';
    case 'moonshot':
      return 'moonshot';
    default:
      return provider || 'unknown';
  }
}

function isOpenAIResponsesApi(api: string | undefined): boolean {
  return api !== undefined && OPENAI_RESPONSES_APIS.has(api);
}

/**
 * Resolve the request capabilities for a given (provider, api, baseUrl, model)
 * tuple. Pure function — no IO, no plugin manifests.
 *
 * Adapter authors call this from `buildReplayPolicy`, `normalizeToolSchemas`,
 * and `wrapStreamFn` to pick the right per-vendor behavior.
 */
export function resolveProviderRequestCapabilities(
  input: ProviderRequestCapabilitiesInput,
): ProviderRequestCapabilities {
  const provider = normalizeOptionalLowercaseString(input.provider);
  const api = normalizeOptionalLowercaseString(input.api);
  const endpointClass = resolveBundledOpenAIResponsesEndpointClass(input.baseUrl);
  const usesConfiguredBaseUrl = endpointClass !== 'default';
  const usesKnownNativeOpenAIEndpoint =
    endpointClass === 'openai-public' ||
    endpointClass === 'openai-codex' ||
    endpointClass === 'azure-openai';
  const usesKnownNativeOpenAIRoute =
    endpointClass === 'default' ? provider === 'openai' : usesKnownNativeOpenAIEndpoint;
  const usesExplicitProxyLikeEndpoint = usesConfiguredBaseUrl && !usesKnownNativeOpenAIEndpoint;
  const isResponsesApi = isOpenAIResponsesApi(api);
  const isKnownNativeEndpoint =
    endpointClass !== 'default' &&
    endpointClass !== 'local' &&
    endpointClass !== 'custom' &&
    endpointClass !== 'invalid';

  const promptCacheKeySupport = readCompatBoolean(input.compat, 'supportsPromptCacheKey');
  const shouldStripResponsesPromptCache =
    promptCacheKeySupport === true
      ? false
      : promptCacheKeySupport === false
        ? isResponsesApi
        : isResponsesApi && usesExplicitProxyLikeEndpoint;

  const supportsResponsesStoreField =
    readCompatBoolean(input.compat, 'supportsStore') !== false && isResponsesApi;

  // Suppress unused-parameter warnings for fields we accept but don't yet
  // branch on. Callers may pass them for future-compat.
  void input.transport;
  void input.capability;
  void input.modelId;
  void readStringValue;

  return {
    ...(provider !== undefined ? { provider } : {}),
    endpointClass,
    knownProviderFamily: resolveKnownProviderFamily(provider),
    usesConfiguredBaseUrl,
    usesKnownNativeOpenAIEndpoint,
    usesKnownNativeOpenAIRoute,
    usesExplicitProxyLikeEndpoint,
    isKnownNativeEndpoint,
    allowsOpenAIServiceTier:
      (provider === 'openai' && api === 'openai-responses' && endpointClass === 'openai-public') ||
      (provider === 'openai-codex' &&
        (api === 'openai-codex-responses' || api === 'openai-responses') &&
        endpointClass === 'openai-codex'),
    allowsAnthropicServiceTier:
      provider === 'anthropic' &&
      api === 'anthropic-messages' &&
      (endpointClass === 'default' || endpointClass === 'anthropic-public'),
    supportsResponsesStoreField,
    allowsResponsesStore:
      supportsResponsesStoreField &&
      provider !== undefined &&
      OPENAI_RESPONSES_PROVIDERS.has(provider) &&
      usesKnownNativeOpenAIEndpoint,
    shouldStripResponsesPromptCache,
    supportsNativeStreamingUsageCompat:
      endpointClass === 'moonshot-native' || endpointClass === 'modelstudio-native',
    supportsOpenAICompletionsStreamingUsageCompat: false,
  };
}
