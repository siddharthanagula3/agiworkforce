
import {
  createAnthropicAdapter,
  type AnthropicAdapterConfig,
} from '@agiworkforce/providers-anthropic';
import {
  createDeepSeekAdapter,
  type DeepSeekAdapterConfig,
} from '@agiworkforce/providers-deepseek';
import { createGoogleAdapter, type GoogleAdapterConfig } from '@agiworkforce/providers-google';
import {
  createLMStudioAdapter,
  type LMStudioAdapterConfig,
} from '@agiworkforce/providers-lmstudio';
import { createMinimaxAdapter, type MinimaxAdapterConfig } from '@agiworkforce/providers-minimax';
import {
  createMoonshotAdapter,
  type MoonshotAdapterConfig,
} from '@agiworkforce/providers-moonshot';
import { createOllamaAdapter, type OllamaAdapterConfig } from '@agiworkforce/providers-ollama';
import { createOpenAIAdapter, type OpenAIAdapterConfig } from '@agiworkforce/providers-openai';
import {
  createOpenRouterAdapter,
  type OpenRouterAdapterConfig,
} from '@agiworkforce/providers-openrouter';
import {
  createPerplexityAdapter,
  type PerplexityAdapterConfig,
} from '@agiworkforce/providers-perplexity';
import { createQwenAdapter, type QwenAdapterConfig } from '@agiworkforce/providers-qwen';
import { createXAIAdapter, type XAIAdapterConfig } from '@agiworkforce/providers-xai';
import { createZhipuAdapter, type ZhipuAdapterConfig } from '@agiworkforce/providers-zhipu';
import type { ProviderAdapter } from '@agiworkforce/types';

export interface ProviderAdapterConfigMap {
  anthropic: AnthropicAdapterConfig;
  deepseek: DeepSeekAdapterConfig;
  google: GoogleAdapterConfig;
  lmstudio: LMStudioAdapterConfig;
  minimax: MinimaxAdapterConfig;
  moonshot: MoonshotAdapterConfig;
  ollama: OllamaAdapterConfig;
  openai: OpenAIAdapterConfig;
  open_router: OpenRouterAdapterConfig;
  perplexity: PerplexityAdapterConfig;
  qwen: QwenAdapterConfig;
  xai: XAIAdapterConfig;
  zhipu: ZhipuAdapterConfig;
}

export type ProviderAdapterId = keyof ProviderAdapterConfigMap;

export const PROVIDER_ADAPTER_IDS = [
  'anthropic',
  'deepseek',
  'google',
  'lmstudio',
  'minimax',
  'moonshot',
  'ollama',
  'openai',
  'open_router',
  'perplexity',
  'qwen',
  'xai',
  'zhipu',
] as const satisfies readonly ProviderAdapterId[];

type ProviderAdapterFactories = {
  [ProviderId in ProviderAdapterId]: (
    config: ProviderAdapterConfigMap[ProviderId],
  ) => ProviderAdapter;
};

const PROVIDER_ADAPTER_FACTORIES: ProviderAdapterFactories = {
  anthropic: createAnthropicAdapter,
  deepseek: createDeepSeekAdapter,
  google: createGoogleAdapter,
  lmstudio: createLMStudioAdapter,
  minimax: createMinimaxAdapter,
  moonshot: createMoonshotAdapter,
  ollama: createOllamaAdapter,
  openai: createOpenAIAdapter,
  open_router: createOpenRouterAdapter,
  perplexity: createPerplexityAdapter,
  qwen: createQwenAdapter,
  xai: createXAIAdapter,
  zhipu: createZhipuAdapter,
};

export function isProviderAdapterId(value: unknown): value is ProviderAdapterId {
  return typeof value === 'string' && (PROVIDER_ADAPTER_IDS as readonly string[]).includes(value);
}

export function createProviderAdapter<ProviderId extends ProviderAdapterId>(
  providerId: ProviderId,
  config: ProviderAdapterConfigMap[ProviderId],
): ProviderAdapter {
  if (!isProviderAdapterId(providerId)) {
    throw new Error(`Unsupported provider adapter: ${String(providerId)}`);
  }

  const factory = PROVIDER_ADAPTER_FACTORIES[providerId] as (
    providerConfig: ProviderAdapterConfigMap[ProviderAdapterId],
  ) => ProviderAdapter;
  return factory(config as ProviderAdapterConfigMap[ProviderAdapterId]);
}
