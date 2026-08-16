
import type { ProviderEndpointClass, ProviderRequestCapabilities } from './provider-attribution';
import { resolveProviderRequestCapabilities } from './provider-attribution';

export interface OpenAICompletionsCompatDefaultsInput {
  provider?: string;
  endpointClass: ProviderEndpointClass;
  knownProviderFamily: string;
  supportsNativeStreamingUsageCompat?: boolean;
  supportsOpenAICompletionsStreamingUsageCompat?: boolean;
  usesExplicitProxyLikeEndpoint?: boolean;
}

export interface OpenAICompletionsCompatDefaults {
  supportsStore: boolean;
  supportsDeveloperRole: boolean;
  supportsReasoningEffort: boolean;
  supportsUsageInStreaming: boolean;
  maxTokensField: 'max_completion_tokens' | 'max_tokens';
  thinkingFormat: 'openai' | 'openrouter' | 'deepseek' | 'zai';
  visibleReasoningDetailTypes: string[];
  supportsStrictMode: boolean;
}

export interface DetectedOpenAICompletionsCompat {
  capabilities: ProviderRequestCapabilities;
  defaults: OpenAICompletionsCompatDefaults;
}

function isDefaultRouteProvider(provider: string | undefined, ...ids: string[]): boolean {
  return provider !== undefined && ids.includes(provider);
}

export function resolveOpenAICompletionsCompatDefaults(
  input: OpenAICompletionsCompatDefaultsInput,
): OpenAICompletionsCompatDefaults {
  const {
    provider,
    endpointClass,
    knownProviderFamily,
    supportsNativeStreamingUsageCompat = false,
    supportsOpenAICompletionsStreamingUsageCompat = false,
    usesExplicitProxyLikeEndpoint = false,
  } = input;
  const isDefaultRoute = endpointClass === 'default';
  const usesConfiguredNonOpenAIEndpoint =
    endpointClass !== 'default' && endpointClass !== 'openai-public';
  const isMoonshotLike =
    knownProviderFamily === 'moonshot' ||
    knownProviderFamily === 'modelstudio' ||
    endpointClass === 'moonshot-native' ||
    endpointClass === 'modelstudio-native';
  const isZai =
    endpointClass === 'zai-native' || (isDefaultRoute && isDefaultRouteProvider(provider, 'zai'));
  const isDeepSeek =
    endpointClass === 'deepseek-native' ||
    (isDefaultRoute && isDefaultRouteProvider(provider, 'deepseek'));
  const isNonStandard =
    endpointClass === 'chutes-native' ||
    endpointClass === 'deepseek-native' ||
    endpointClass === 'mistral-public' ||
    endpointClass === 'opencode-native' ||
    endpointClass === 'xai-native' ||
    isZai ||
    (isDefaultRoute && isDefaultRouteProvider(provider, 'chutes', 'deepseek', 'opencode', 'xai'));
  const isOpenRouterLike = provider === 'openrouter' || endpointClass === 'openrouter';
  const usesMaxTokens =
    endpointClass === 'chutes-native' ||
    endpointClass === 'mistral-public' ||
    knownProviderFamily === 'mistral' ||
    (isDefaultRoute && isDefaultRouteProvider(provider, 'chutes'));
  return {
    supportsStore:
      !isNonStandard && knownProviderFamily !== 'mistral' && !usesExplicitProxyLikeEndpoint,
    supportsDeveloperRole: !isNonStandard && !isMoonshotLike && !usesConfiguredNonOpenAIEndpoint,
    supportsReasoningEffort:
      !isZai &&
      knownProviderFamily !== 'mistral' &&
      endpointClass !== 'xai-native' &&
      !usesExplicitProxyLikeEndpoint,
    supportsUsageInStreaming:
      supportsOpenAICompletionsStreamingUsageCompat ||
      (!isNonStandard && (!usesConfiguredNonOpenAIEndpoint || supportsNativeStreamingUsageCompat)),
    maxTokensField: usesMaxTokens ? 'max_tokens' : 'max_completion_tokens',
    thinkingFormat: isDeepSeek
      ? 'deepseek'
      : isZai
        ? 'zai'
        : isOpenRouterLike
          ? 'openrouter'
          : 'openai',
    visibleReasoningDetailTypes: isOpenRouterLike ? ['response.output_text', 'response.text'] : [],
    supportsStrictMode: !isZai && !usesConfiguredNonOpenAIEndpoint,
  };
}

export function detectOpenAICompletionsCompat(model: {
  provider?: string;
  baseUrl?: string;
  id?: string;
  compat?: { supportsStore?: boolean } | null;
}): DetectedOpenAICompletionsCompat {
  const capabilities = resolveProviderRequestCapabilities({
    provider: model.provider,
    api: 'openai-completions',
    baseUrl: model.baseUrl,
    capability: 'llm',
    transport: 'stream',
    modelId: model.id,
    compat:
      model.compat && typeof model.compat === 'object'
        ? (model.compat as { supportsStore?: boolean })
        : undefined,
  });
  return {
    capabilities,
    defaults: resolveOpenAICompletionsCompatDefaults({
      ...(model.provider !== undefined ? { provider: model.provider } : {}),
      endpointClass: capabilities.endpointClass,
      knownProviderFamily: capabilities.knownProviderFamily,
      supportsNativeStreamingUsageCompat: capabilities.supportsNativeStreamingUsageCompat,
      supportsOpenAICompletionsStreamingUsageCompat:
        capabilities.supportsOpenAICompletionsStreamingUsageCompat,
      usesExplicitProxyLikeEndpoint: capabilities.usesExplicitProxyLikeEndpoint,
    }),
  };
}
