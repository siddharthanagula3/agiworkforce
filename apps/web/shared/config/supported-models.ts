import {
  detectProviderFromModelId,
  getModelIdsForProvider as getCatalogModelIdsForProvider,
  getModelsForProvider as getCatalogModelsForProvider,
  getProviderDefaultModel,
  getTaskModelForProvider,
  normalizeModelId,
  type ModelType,
  type Provider,
} from '@agiworkforce/types';

type ProviderModelKey =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'perplexity'
  | 'grok'
  | 'deepseek'
  | 'qwen';

const CHAT_MODEL_TYPES: ModelType[] = ['chat', 'code', 'reasoning', 'multimodal', 'search'];
const IMAGE_MODEL_TYPES: ModelType[] = ['image'];
const VIDEO_MODEL_TYPES: ModelType[] = ['video'];
const AUDIO_MODEL_TYPES: ModelType[] = ['tts', 'stt'];

function getProviderModelIds(provider: Provider, modelTypes: ModelType[]): readonly string[] {
  return getCatalogModelIdsForProvider(provider, {
    includeDeprecated: false,
    modelTypes,
  });
}

function getVisionEnabledModelIds(provider: Provider): readonly string[] {
  return getCatalogModelsForProvider(provider, {
    includeDeprecated: false,
    modelTypes: CHAT_MODEL_TYPES,
    requireCapabilities: {
      vision: true,
    },
  }).map((model) => model.id);
}

export const SUPPORTED_ANTHROPIC_MODELS = getProviderModelIds('anthropic', CHAT_MODEL_TYPES);
export type AnthropicModel = string;
export const DEFAULT_ANTHROPIC_MODEL: AnthropicModel =
  getProviderDefaultModel('anthropic') ?? 'claude-sonnet-4.6';
export const DEFAULT_ANTHROPIC_COLLABORATION_MODEL: AnthropicModel =
  getTaskModelForProvider('anthropic', 'chat') ?? DEFAULT_ANTHROPIC_MODEL;

export const SUPPORTED_OPENAI_MODELS = getProviderModelIds('openai', CHAT_MODEL_TYPES);
export type OpenAIModel = string;
export const DEFAULT_OPENAI_MODEL: OpenAIModel = getProviderDefaultModel('openai') ?? 'gpt-5.4';
export const DEFAULT_OPENAI_FAST_MODEL: OpenAIModel =
  getTaskModelForProvider('openai', 'fast_completion') ?? DEFAULT_OPENAI_MODEL;
export const SUPPORTED_OPENAI_IMAGE_MODELS = getProviderModelIds('openai', IMAGE_MODEL_TYPES);
export const SUPPORTED_OPENAI_VIDEO_MODELS = getProviderModelIds('openai', VIDEO_MODEL_TYPES);
export const SUPPORTED_OPENAI_AUDIO_MODELS = getProviderModelIds('openai', AUDIO_MODEL_TYPES);

export const SUPPORTED_GOOGLE_MODELS = getProviderModelIds('google', CHAT_MODEL_TYPES);
export type GoogleModel = string;
export const DEFAULT_GOOGLE_MODEL: GoogleModel =
  getProviderDefaultModel('google') ?? 'gemini-3.1-pro-preview';
export const DEFAULT_GOOGLE_FAST_MODEL: GoogleModel =
  getTaskModelForProvider('google', 'chat') ?? DEFAULT_GOOGLE_MODEL;
export const SUPPORTED_GOOGLE_IMAGE_MODELS = getProviderModelIds('google', IMAGE_MODEL_TYPES);
export const SUPPORTED_GOOGLE_VIDEO_MODELS = getProviderModelIds('google', VIDEO_MODEL_TYPES);
export const SUPPORTED_GOOGLE_AUDIO_MODELS = getProviderModelIds('google', AUDIO_MODEL_TYPES);

export const SUPPORTED_PERPLEXITY_MODELS = getProviderModelIds('perplexity', CHAT_MODEL_TYPES);
export type PerplexityModel = string;
export const DEFAULT_PERPLEXITY_MODEL: PerplexityModel =
  getProviderDefaultModel('perplexity') ?? 'sonar';

export const SUPPORTED_GROK_MODELS = getProviderModelIds('xai', CHAT_MODEL_TYPES);
export type GrokModel = string;
export const DEFAULT_GROK_MODEL: GrokModel = getProviderDefaultModel('xai') ?? 'grok-4';
export const SUPPORTED_GROK_IMAGE_MODELS = getProviderModelIds('xai', IMAGE_MODEL_TYPES);
export const SUPPORTED_GROK_VISION_MODELS = getVisionEnabledModelIds('xai');

export const SUPPORTED_DEEPSEEK_MODELS = getProviderModelIds('deepseek', CHAT_MODEL_TYPES);
export type DeepSeekModel = string;
export const DEFAULT_DEEPSEEK_MODEL: DeepSeekModel =
  getProviderDefaultModel('deepseek') ?? 'deepseek-chat';

export const SUPPORTED_QWEN_MODELS = getProviderModelIds('qwen', CHAT_MODEL_TYPES);
export type QwenModel = string;
export const DEFAULT_QWEN_MODEL: QwenModel = getProviderDefaultModel('qwen') ?? 'qwen-max';
export const SUPPORTED_QWEN_IMAGE_MODELS = getProviderModelIds('qwen', IMAGE_MODEL_TYPES);
export const SUPPORTED_QWEN_VIDEO_MODELS = getProviderModelIds('qwen', VIDEO_MODEL_TYPES);

export type LLMProvider = ProviderModelKey;

export const ALL_PROVIDERS: LLMProvider[] = [
  'anthropic',
  'openai',
  'google',
  'perplexity',
  'grok',
  'deepseek',
  'qwen',
];

export const SUPPORTED_MODELS: Record<LLMProvider, readonly string[]> = {
  anthropic: SUPPORTED_ANTHROPIC_MODELS,
  openai: SUPPORTED_OPENAI_MODELS,
  google: SUPPORTED_GOOGLE_MODELS,
  perplexity: SUPPORTED_PERPLEXITY_MODELS,
  grok: SUPPORTED_GROK_MODELS,
  deepseek: SUPPORTED_DEEPSEEK_MODELS,
  qwen: SUPPORTED_QWEN_MODELS,
};

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: DEFAULT_ANTHROPIC_MODEL,
  openai: DEFAULT_OPENAI_MODEL,
  google: DEFAULT_GOOGLE_MODEL,
  perplexity: DEFAULT_PERPLEXITY_MODEL,
  grok: DEFAULT_GROK_MODEL,
  deepseek: DEFAULT_DEEPSEEK_MODEL,
  qwen: DEFAULT_QWEN_MODEL,
};

function toProviderKey(provider: Provider | string | null): LLMProvider | undefined {
  if (!provider) {
    return undefined;
  }

  if (provider === 'xai') {
    return 'grok';
  }

  return ALL_PROVIDERS.includes(provider as LLMProvider) ? (provider as LLMProvider) : undefined;
}

export function isValidModel(provider: LLMProvider, model: string): boolean {
  const canonicalModelId = normalizeModelId(model) ?? model;
  return SUPPORTED_MODELS[provider].includes(canonicalModelId);
}

export function getDefaultModel(provider: LLMProvider): string {
  return DEFAULT_MODELS[provider];
}

export function getModelsForProvider(provider: LLMProvider): readonly string[] {
  return SUPPORTED_MODELS[provider];
}

export function detectProviderFromModel(model: string): LLMProvider | undefined {
  return toProviderKey(detectProviderFromModelId(model));
}
