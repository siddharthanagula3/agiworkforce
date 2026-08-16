
import { readStringValue, normalizeOptionalLowercaseString } from './lib/string-utils';
import { resolveBundledOpenAIResponsesEndpointClass } from './openai-responses-payload-policy';

export type ProviderRequestTransport = 'stream' | 'websocket' | 'http' | 'media-understanding';
export type ProviderRequestCapability = 'llm' | 'audio' | 'image' | 'video' | 'other';
export type ProviderEndpointClass =
  | 'default'
  | 'anthropic-public'
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

const OPENAI_RESPONSES_APIS = new Set(['openai-responses', 'openai-codex-responses']);
const OPENAI_RESPONSES_PROVIDERS = new Set(['openai']);

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

export function resolveProviderRequestCapabilities(
  input: ProviderRequestCapabilitiesInput,
): ProviderRequestCapabilities {
  const provider = normalizeOptionalLowercaseString(input.provider);
  const api = normalizeOptionalLowercaseString(input.api);
  const endpointClass = resolveBundledOpenAIResponsesEndpointClass(input.baseUrl);
  const usesConfiguredBaseUrl = endpointClass !== 'default';
  const usesKnownNativeOpenAIEndpoint =
    endpointClass === 'openai-public' || endpointClass === 'openai-codex';
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
