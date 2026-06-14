import {
  getPickerModels,
  PROVIDERS_IN_ORDER as PROVIDER_ORDER,
  PROVIDER_DISPLAY,
  normalizeModelId,
  providerLabels,
  type PickerModelTier,
  type Provider,
  type ProviderId,
} from '@agiworkforce/types';

export type ModelTier = PickerModelTier;

export interface ModelDef {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  tier: ModelTier;
  isNew?: boolean;
}

export interface ProviderDef {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface AutoModeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: ModelTier;
}

export const AUTO_MODES: AutoModeDef[] = [
  {
    id: 'auto-economy',
    name: 'Economy',
    description: 'Best for cost',
    icon: 'Zap',
    tier: 'economy',
  },
  {
    id: 'auto-balanced',
    name: 'Balanced',
    description: 'Best value',
    icon: 'Scale',
    tier: 'balanced',
  },
  {
    id: 'auto-premium',
    name: 'Best',
    description: 'Most capable',
    icon: 'Crown',
    tier: 'premium',
  },
];

const PROVIDER_META: Partial<Record<Provider | string, Pick<ProviderDef, 'icon'>>> = {
  openai: { icon: 'Sparkles' },
  anthropic: { icon: 'Brain' },
  google: { icon: 'Globe' },
  xai: { icon: 'Atom' },
  deepseek: { icon: 'Search' },
  moonshot: { icon: 'Moon' },
  qwen: { icon: 'Cloud' },
  zhipu: { icon: 'Cpu' },
  perplexity: { icon: 'Compass' },
};

const MOBILE_PROVIDER_IDS = PROVIDER_ORDER.filter((providerId) => providerId in PROVIDER_META);

export const PROVIDERS: ProviderDef[] = MOBILE_PROVIDER_IDS.map((providerId) => ({
  id: providerId,
  name: providerLabels[providerId] ?? providerId,
  icon: PROVIDER_META[providerId]?.icon ?? 'Sparkles',
  color:
    PROVIDER_DISPLAY[providerId as ProviderId]?.brandColor ??
    PROVIDER_DISPLAY['custom-openai-compatible'].brandColor,
}));

export const MODEL_LIST: ModelDef[] = getPickerModels({
  allowedProviders: MOBILE_PROVIDER_IDS,
  modelTypes: ['chat', 'reasoning', 'multimodal', 'search'],
}).map((model) => ({
  id: model.id,
  name: model.name,
  provider: model.provider,
  contextWindow: model.contextWindow,
  maxOutput: model.maxOutput,
  supportsVision: model.supportsVision,
  supportsThinking: model.supportsThinking,
  tier: model.tier,
}));

const modelMap = new Map<string, ModelDef>(MODEL_LIST.map((model) => [model.id, model]));
const providerMap = new Map<string, ProviderDef>(
  PROVIDERS.map((provider) => [provider.id, provider]),
);
const autoModeMap = new Map<string, AutoModeDef>(AUTO_MODES.map((mode) => [mode.id, mode]));

export function getModelById(id: string): ModelDef | undefined {
  return modelMap.get(normalizeModelId(id) ?? id);
}

export function getModelsByProvider(providerId: string): ModelDef[] {
  return MODEL_LIST.filter((model) => model.provider === providerId);
}

export function getProviderById(id: string): ProviderDef | undefined {
  return providerMap.get(id);
}

export function isAutoMode(id: string): boolean {
  return autoModeMap.has(id);
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${millions % 1 === 0 ? millions : millions.toFixed(1)}M`;
  }

  const thousands = tokens / 1_000;
  return `${thousands % 1 === 0 ? thousands : thousands.toFixed(0)}K`;
}

export function getDisplayName(id: string): string {
  const autoMode = autoModeMap.get(id);
  if (autoMode) {
    return `Auto (${autoMode.name})`;
  }

  return getModelById(id)?.name ?? id;
}

export function getShortDisplayName(id: string): string {
  const autoMode = autoModeMap.get(id);
  if (autoMode) {
    return autoMode.name;
  }

  const model = getModelById(id);
  if (!model) {
    return id;
  }

  return model.name;
}
