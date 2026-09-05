import {
  createAnthropicAdapter,
  type AnthropicAdapterConfig,
} from '@agiworkforce/providers-anthropic';
import {
  createDeepSeekAdapter,
  type DeepSeekAdapterConfig,
} from '@agiworkforce/providers-deepseek';
import { createGoogleAdapter, type GoogleAdapterConfig } from '@agiworkforce/providers-google';
import { createGroqAdapter, type GroqAdapterConfig } from '@agiworkforce/providers-groq';
import {
  createLMStudioAdapter,
  type LMStudioAdapterConfig,
} from '@agiworkforce/providers-lmstudio';
import { createMinimaxAdapter, type MinimaxAdapterConfig } from '@agiworkforce/providers-minimax';
import {
  createMoonshotAdapter,
  type MoonshotAdapterConfig,
} from '@agiworkforce/providers-moonshot';
import { createNvidiaAdapter, type NvidiaAdapterConfig } from '@agiworkforce/providers-nvidia';
import { createOllamaAdapter, type OllamaAdapterConfig } from '@agiworkforce/providers-ollama';
import {
  createOpenAIAdapter,
  createOpenAICompatAdapter,
  type OpenAIAdapterConfig,
  type OpenAICompatAdapterConfig,
} from '@agiworkforce/providers-openai';
import {
  createOpenRouterAdapter,
  type OpenRouterAdapterConfig,
} from '@agiworkforce/providers-openrouter';
import {
  createPerplexityAdapter,
  type PerplexityAdapterConfig,
} from '@agiworkforce/providers-perplexity';
import { createQwenAdapter, type QwenAdapterConfig } from '@agiworkforce/providers-qwen';
import {
  createVercelGatewayAdapter,
  type VercelGatewayAdapterConfig,
} from '@agiworkforce/providers-vercel-gateway';
import {
  createWorkersAiAdapter,
  type WorkersAiAdapterConfig,
} from '@agiworkforce/providers-workers-ai';
import { createXAIAdapter, type XAIAdapterConfig } from '@agiworkforce/providers-xai';
import { createZhipuAdapter, type ZhipuAdapterConfig } from '@agiworkforce/providers-zhipu';
import type { ModelInfo, Provider, ProviderAdapter } from '@agiworkforce/types';

export {
  createGatewayAdapter,
  type GatewayDefinition,
  type GatewayEndpointDefinition,
  type GatewayEnvSource,
  type GatewayGovernanceStub,
  type GatewayModelsSource,
  type GatewayPricingSource,
  type GatewayProtocol,
} from './gateway';

export interface OpenAICompatRouteConfig extends OpenAICompatAdapterConfig {
  providerId: string;
  label: string;
  apiKeyEnvVar: string;
  catalog?: readonly ModelInfo[];
}

export interface ProviderAdapterConfigMap {
  openai_compat: OpenAICompatRouteConfig;
  anthropic: AnthropicAdapterConfig;
  deepseek: DeepSeekAdapterConfig;
  google: GoogleAdapterConfig;
  groq: GroqAdapterConfig;
  lmstudio: LMStudioAdapterConfig;
  minimax: MinimaxAdapterConfig;
  moonshot: MoonshotAdapterConfig;
  nvidia_nim: NvidiaAdapterConfig;
  ollama: OllamaAdapterConfig;
  openai: OpenAIAdapterConfig;
  open_router: OpenRouterAdapterConfig;
  perplexity: PerplexityAdapterConfig;
  qwen: QwenAdapterConfig;
  vercel_gateway: VercelGatewayAdapterConfig;
  workers_ai: WorkersAiAdapterConfig;
  xai: XAIAdapterConfig;
  zhipu: ZhipuAdapterConfig;
}

export type ProviderAdapterId = keyof ProviderAdapterConfigMap;

export const PROVIDER_ADAPTER_IDS = [
  'openai_compat',
  'anthropic',
  'deepseek',
  'google',
  'groq',
  'lmstudio',
  'minimax',
  'moonshot',
  'nvidia_nim',
  'ollama',
  'openai',
  'open_router',
  'perplexity',
  'qwen',
  'vercel_gateway',
  'workers_ai',
  'xai',
  'zhipu',
] as const satisfies readonly ProviderAdapterId[];

type ProviderAdapterFactories = {
  [ProviderId in ProviderAdapterId]: (
    config: ProviderAdapterConfigMap[ProviderId],
  ) => ProviderAdapter;
};

const EMPTY_COMPAT_CATALOG: readonly ModelInfo[] = [];

function createOpenAICompatRouteAdapter(config: OpenAICompatRouteConfig): ProviderAdapter {
  const { providerId, label, apiKeyEnvVar, catalog, ...adapterConfig } = config;
  return createOpenAICompatAdapter(
    {
      id: providerId as Provider,
      label,
      apiKeyEnvVar,
      apiKeyLabel: label,
      catalog: catalog ?? EMPTY_COMPAT_CATALOG,
    },
    adapterConfig,
  );
}

const PROVIDER_ADAPTER_FACTORIES: ProviderAdapterFactories = {
  openai_compat: createOpenAICompatRouteAdapter,
  anthropic: createAnthropicAdapter,
  deepseek: createDeepSeekAdapter,
  google: createGoogleAdapter,
  groq: createGroqAdapter,
  lmstudio: createLMStudioAdapter,
  minimax: createMinimaxAdapter,
  moonshot: createMoonshotAdapter,
  nvidia_nim: createNvidiaAdapter,
  ollama: createOllamaAdapter,
  openai: createOpenAIAdapter,
  open_router: createOpenRouterAdapter,
  perplexity: createPerplexityAdapter,
  qwen: createQwenAdapter,
  vercel_gateway: createVercelGatewayAdapter,
  workers_ai: createWorkersAiAdapter,
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
