/**
 * Local-first model catalog for Mobile v1.
 *
 * Active/selectable rows come from @agiworkforce/local-llm. Cloud provider
 * models are included only as locked visual context; this service never fetches
 * `/api/models` and never enables BYOK or managed-cloud sends.
 */

import {
  getDefaultModel as getCatalogDefaultModel,
  getModelById as getCatalogModelById,
  getShippableModels as getCatalogShippableModels,
} from '@agiworkforce/local-llm';
import type { OnDeviceModel, PickerModelTier } from '@agiworkforce/types';
import { MODEL_LIST as CLOUD_MODEL_LIST, type ModelDef as CloudModelDef } from '@/lib/models';

export type ModelTier = PickerModelTier;
export type ModelSurface = 'local' | 'cloud_managed';
export type ModelAvailability = 'ready' | 'download_required' | 'locked';

export interface ModelDef {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  tier: ModelTier;
  surface: ModelSurface;
  availability: ModelAvailability;
  runtimeLabel: string;
  detailLabel: string;
  /** Short marketing description shown in the model picker below the name. */
  description?: string;
  lockReason?: string;
  fileSizeBytes?: number;
  license?: string;
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

const LOCAL_PROVIDER_ID = 'local';
export const CLOUD_LOCK_REASON = 'Cloud Managed is invite-only. Mobile BYOK is not available.';

/**
 * Static model descriptions shown as a subtitle in the picker.
 * Keyed by model id (exact) — purely marketing copy, never used for routing.
 * models.json does not carry per-model description strings today,
 * so we maintain them here as a static lookup.
 *
 * The string keys below are display/marketing identifiers, not routing literals.
 * eslint-disable-next-line is intentional: these are picker labels, not model
 * resolution calls.
 */

const MODEL_DESCRIPTIONS: Record<string, string> = {
  // Local / on-device

  'qwen3-4b-instruct-2507': 'Efficient on-device model for everyday tasks',

  'llama-3.2-1b-instruct-spinquant': 'Lightweight model for quick responses',
  // Apple on-device

  'apple-afm-on-device': 'Built-in Apple Intelligence model',
  // Cloud providers (shown as locked in v1 — informational only)
  // Anthropic
  // eslint-disable-next-line no-restricted-syntax
  'claude-opus-4.8': 'Most capable for ambitious work',
  // eslint-disable-next-line no-restricted-syntax
  'claude-sonnet-4.6': 'Most efficient for everyday tasks',
  // eslint-disable-next-line no-restricted-syntax
  'claude-haiku-4.5': 'Fastest for quick answers',
  // OpenAI
  // eslint-disable-next-line no-restricted-syntax
  'gpt-5.5': 'Most capable OpenAI model',
  // eslint-disable-next-line no-restricted-syntax
  'gpt-5.4-mini': 'Fast and affordable responses',
  // Google
  // eslint-disable-next-line no-restricted-syntax
  'gemini-3.1-pro-preview': "Google's most capable model",
  // eslint-disable-next-line no-restricted-syntax
  'gemini-3.1-flash-lite': 'Fast and efficient Google model',
};

const FALLBACK_LOCAL_MODEL: OnDeviceModel = {
  id: 'qwen3-4b-instruct-2507',
  displayName: 'AGI Standard',
  family: 'qwen3',
  paramCountB: 4,
  fileSizeBytes: 2_147_483_648,
  supportedRuntimes: ['executorch', 'llama-rn'],
  contextWindow: 262_144,
  capabilities: {
    text: true,
    visionIn: false,
    audioIn: false,
    toolCalls: true,
    structuredOutput: true,
  },
  license: 'Apache-2.0',
  role: 'default',
  shipsInV1: true,
};

function safeGetShippableModels(): OnDeviceModel[] {
  try {
    if (typeof getCatalogShippableModels === 'function') {
      const models = getCatalogShippableModels();
      if (Array.isArray(models) && models.length > 0) return models;
    }
  } catch {
    // Tests may mock @agiworkforce/local-llm partially; keep the picker stable.
  }

  try {
    if (typeof getCatalogDefaultModel === 'function') {
      return [getCatalogDefaultModel()];
    }
  } catch {
    // Fall through to direct lookup or static fallback.
  }

  try {
    if (typeof getCatalogModelById === 'function') {
      const model = getCatalogModelById(FALLBACK_LOCAL_MODEL.id);
      if (model) return [model];
    }
  } catch {
    // Fall through to static fallback.
  }

  return [FALLBACK_LOCAL_MODEL];
}

function safeGetDefaultModel(models: OnDeviceModel[]): OnDeviceModel {
  try {
    if (typeof getCatalogDefaultModel === 'function') {
      return getCatalogDefaultModel();
    }
  } catch {
    // Fall through to local list fallback.
  }

  return models.find((model) => model.role === 'default') ?? models[0] ?? FALLBACK_LOCAL_MODEL;
}

const SHIPPABLE_LOCAL_MODELS = safeGetShippableModels();
const DEFAULT_LOCAL_MODEL = safeGetDefaultModel(SHIPPABLE_LOCAL_MODELS);
const CLOUD_MODEL_SOURCE = Array.isArray(CLOUD_MODEL_LIST) ? CLOUD_MODEL_LIST : [];

export const DEFAULT_LOCAL_MODEL_ID = DEFAULT_LOCAL_MODEL.id;

export const AUTO_MODES: AutoModeDef[] = [
  {
    id: 'auto-balanced',
    name: 'Best',
    description: 'Best local model for this device',
    icon: 'Cpu',
    tier: 'balanced',
  },
  {
    id: 'auto-economy',
    name: 'Lite',
    description: 'Small local model when battery matters',
    icon: 'Zap',
    tier: 'economy',
  },
  {
    id: 'auto-premium',
    name: 'Vision',
    description: 'On-device vision when available',
    icon: 'ScanEye',
    tier: 'premium',
  },
];

export const PROVIDERS: ProviderDef[] = [
  {
    id: LOCAL_PROVIDER_ID,
    name: 'On device',
    icon: 'Cpu',
    color: '#14b8a6',
  },
  {
    id: 'cloud_managed',
    name: 'Cloud Managed',
    icon: 'Cloud',
    color: '#64748b',
  },
];

function tierForLocalModel(model: OnDeviceModel): ModelTier {
  switch (model.role) {
    case 'lite-mode':
      return 'economy';
    case 'premium-vision-pack':
    case 'premium-multimodal-alt':
      return 'premium';
    default:
      return 'balanced';
  }
}

function runtimeLabel(model: OnDeviceModel): string {
  if (model.supportedRuntimes.includes('apple-foundation-models')) return 'Apple on-device';
  if (model.supportedRuntimes.includes('aicore')) return 'Android AICore';
  if (model.supportedRuntimes.includes('executorch')) return 'ExecuTorch';
  return 'llama.rn';
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return 'Built in';
  const gib = bytes / 1024 / 1024 / 1024;
  return `${gib >= 1 ? gib.toFixed(gib >= 10 ? 0 : 1) : '<1'} GB`;
}

function detailForLocalModel(model: OnDeviceModel): string {
  const parts = [runtimeLabel(model), formatSize(model.fileSizeBytes)];
  if (model.capabilities.visionIn) parts.push('Vision');
  if (model.capabilities.toolCalls) parts.push('Tools');
  return parts.join(' - ');
}

function maxOutputForContext(contextWindow: number): number {
  return Math.min(8192, Math.max(1024, Math.floor(contextWindow / 4)));
}

function toLocalModelDef(model: OnDeviceModel): ModelDef {
  return {
    id: model.id,
    name: model.displayName,
    provider: LOCAL_PROVIDER_ID,
    providerLabel: 'On device',
    contextWindow: model.contextWindow,
    maxOutput: maxOutputForContext(model.contextWindow),
    supportsVision: model.capabilities.visionIn,
    supportsThinking: false,
    tier: tierForLocalModel(model),
    surface: 'local',
    availability: model.fileSizeBytes === 0 ? 'ready' : 'download_required',
    runtimeLabel: runtimeLabel(model),
    detailLabel: detailForLocalModel(model),
    description: MODEL_DESCRIPTIONS[model.id],
    fileSizeBytes: model.fileSizeBytes,
    license: model.license,
  };
}

function toLockedCloudModelDef(model: CloudModelDef): ModelDef {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    providerLabel: 'Cloud Managed',
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    supportsVision: model.supportsVision,
    supportsThinking: model.supportsThinking,
    tier: model.tier,
    surface: 'cloud_managed',
    availability: 'locked',
    runtimeLabel: 'Cloud Managed',
    detailLabel: 'Cloud Managed - invite required',
    description: MODEL_DESCRIPTIONS[model.id],
    lockReason: CLOUD_LOCK_REASON,
  };
}

function firstCloudModelByProvider(providerId: string): CloudModelDef | undefined {
  return CLOUD_MODEL_SOURCE.find((model) => model.provider === providerId);
}

export const LOCAL_MODEL_LIST: ModelDef[] = SHIPPABLE_LOCAL_MODELS.map(toLocalModelDef);

export const LOCKED_CLOUD_MODELS: ModelDef[] = [
  'openai',
  'anthropic',
  'google',
  'perplexity',
  'xai',
  'deepseek',
]
  .map(firstCloudModelByProvider)
  .filter((model): model is CloudModelDef => Boolean(model))
  .map(toLockedCloudModelDef);

export const MODEL_LIST: ModelDef[] = [...LOCAL_MODEL_LIST, ...LOCKED_CLOUD_MODELS];

const localModelMap = new Map<string, ModelDef>(LOCAL_MODEL_LIST.map((model) => [model.id, model]));
const allModelMap = new Map<string, ModelDef>(MODEL_LIST.map((model) => [model.id, model]));
const providerMap = new Map<string, ProviderDef>(
  PROVIDERS.map((provider) => [provider.id, provider]),
);
const autoModeMap = new Map<string, AutoModeDef>(AUTO_MODES.map((mode) => [mode.id, mode]));

export function getModelById(id: string): ModelDef | undefined {
  return allModelMap.get(id);
}

export function getSelectableModelById(id: string): ModelDef | undefined {
  return localModelMap.get(id);
}

export function isSelectableModelId(id: string): boolean {
  return autoModeMap.has(id) || localModelMap.has(id);
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

export function getDisplayName(id: string): string {
  const autoMode = autoModeMap.get(id);
  if (autoMode) return autoMode.name;
  return getModelById(id)?.name ?? id;
}

export function getShortDisplayName(id: string): string {
  return getDisplayName(id);
}

export function getDefaultSelectableModelId(id?: string | null): string {
  if (id && isSelectableModelId(id)) return id;
  return DEFAULT_LOCAL_MODEL_ID;
}

/**
 * Async shape kept for existing consumers/tests. This intentionally returns
 * embedded local/locked metadata only and performs no network request.
 */
export async function fetchModelCatalog(): Promise<ModelDef[]> {
  return MODEL_LIST;
}
