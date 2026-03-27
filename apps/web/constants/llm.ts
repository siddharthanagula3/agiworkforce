/**
 * LLM Constants for web app — reads from the shared models.json (single source of truth).
 *
 * The canonical model catalog lives in packages/types/src/models.json and is
 * re-exported as `modelsCatalogJson` from @agiworkforce/types.
 * This file imports it and re-exports with the same API as the desktop shim.
 */

import {
  getAllowedModelsForTier as getCatalogAllowedModelsForTier,
  getModelMetadataById,
  getProviderDefaultModel as getCatalogProviderDefaultModel,
  getTaskModelForProvider as getCatalogTaskModelForProvider,
  isModelAllowedForTier as isCatalogModelAllowedForTier,
  modelIdAliases,
  modelsById,
  modelsCatalogJson as modelsJson,
  normalizeModelId as normalizeCatalogModelId,
  providerLabels,
} from '@agiworkforce/types';

// ---- Types ----

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  json: boolean;
  thinking: boolean;
  computerUse: boolean;
  agentic: boolean;
  imageGen: boolean;
  videoGen: boolean;
  search: boolean;
  research: boolean;
  codeExecution: boolean;
}

export interface ModelMetadata {
  id: string;
  apiModelId?: string;
  maxOutputTokens?: number;
  name: string;
  provider: string;
  modelType: string;
  contextWindow: number;
  inputCost: number;
  outputCost: number;
  capabilities: ModelCapabilities;
  benchmarks?: Record<string, number>;
  speed: string;
  quality: string;
  qualityTier: string;
  bestFor: string[];
  released?: string;
}

// ---- Derived data from JSON ----

const config = modelsJson;

export const MODEL_ID_ALIASES: Record<string, string> = modelIdAliases;

export function normalizeModelId(modelId: string | null | undefined): string | null {
  return normalizeCatalogModelId(modelId);
}

export const MODEL_METADATA: Record<string, ModelMetadata> = modelsById as Record<
  string,
  ModelMetadata
>;

const CANONICAL_MODEL_METADATA: Record<string, ModelMetadata> = config.models as Record<
  string,
  ModelMetadata
>;

export const PROVIDER_LABELS: Record<string, string> = providerLabels;

export const MODEL_PRESETS: Record<
  string,
  Array<{ value: string; label: string }>
> = config.modelPresets as unknown as Record<string, Array<{ value: string; label: string }>>;

export const THINKING_MODEL_VARIANTS: Record<string, string> = {};

export const PROVIDERS_IN_ORDER: string[] = config.providersInOrder;

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = Object.fromEntries(
  Object.entries(MODEL_METADATA).map(([id, m]) => [id, m.contextWindow]),
);

// ---- Tier logic ----

const ECONOMY_MODELS = getCatalogAllowedModelsForTier('economy');
const PRO_ADDITIONS = getCatalogAllowedModelsForTier('pro_additions');
const FLAGSHIP_ADDITIONS = getCatalogAllowedModelsForTier('flagship_additions');

export const TIER_ALLOWED_MODELS: Record<string, string[]> = {
  free: [...ECONOMY_MODELS],
  hobby: [...ECONOMY_MODELS],
  pro: Array.from(new Set([...PRO_ADDITIONS, ...ECONOMY_MODELS])),
  max: Array.from(new Set([...FLAGSHIP_ADDITIONS, ...PRO_ADDITIONS, ...ECONOMY_MODELS])),
  enterprise: Array.from(new Set([...FLAGSHIP_ADDITIONS, ...PRO_ADDITIONS, ...ECONOMY_MODELS])),
};

// ---- Helper functions ----

export function getModelMetadata(modelId: string): ModelMetadata | null {
  return (getModelMetadataById(modelId) as ModelMetadata | null) ?? null;
}

export function getAllModels(): ModelMetadata[] {
  return Object.values(CANONICAL_MODEL_METADATA);
}

export function getProviderModels(provider: string): ModelMetadata[] {
  return getAllModels().filter((model) => model.provider === provider);
}

export function getModelContextWindow(modelId: string): number {
  const canonicalModelId = normalizeModelId(modelId);
  return (canonicalModelId ? MODEL_CONTEXT_WINDOWS[canonicalModelId] : undefined) ?? 128_000;
}

export function formatCost(inputCost?: number, outputCost?: number): string {
  if (inputCost === undefined && outputCost === undefined) {
    return 'N/A';
  }
  if (inputCost === 0 && outputCost === 0) {
    return 'Included';
  }
  const input = inputCost !== undefined ? `$${inputCost.toFixed(2)}` : 'N/A';
  const output = outputCost !== undefined ? `$${outputCost.toFixed(2)}` : 'N/A';
  return `${input}/${output} per 1M tokens`;
}

export function isModelAllowedForTier(modelId: string, tier: string): boolean {
  if (tier === 'free' || tier === 'hobby') {
    return isCatalogModelAllowedForTier(modelId, 'economy');
  }
  if (tier === 'pro') {
    return (
      isCatalogModelAllowedForTier(modelId, 'economy') ||
      isCatalogModelAllowedForTier(modelId, 'pro_additions')
    );
  }
  if (tier === 'max' || tier === 'enterprise') {
    return (
      isCatalogModelAllowedForTier(modelId, 'economy') ||
      isCatalogModelAllowedForTier(modelId, 'pro_additions') ||
      isCatalogModelAllowedForTier(modelId, 'flagship_additions')
    );
  }
  return false;
}

export function getAllowedModelsForTier(tier: string): string[] {
  return TIER_ALLOWED_MODELS[tier] ?? TIER_ALLOWED_MODELS['free'] ?? [];
}

export function getProviderDefaultModel(provider: string): string | null {
  return getCatalogProviderDefaultModel(provider);
}

export function getTaskModelForProvider(
  provider: string,
  task:
    | 'fast_completion'
    | 'code_generation'
    | 'complex_reasoning'
    | 'chat'
    | 'vision'
    | 'long_context',
): string | null {
  return getCatalogTaskModelForProvider(provider, task);
}

export function normalizeSubscriptionTier(tier: string | null | undefined): string {
  switch ((tier ?? '').toLowerCase()) {
    case 'hobby':
      return 'hobby';
    case 'pro':
      return 'pro';
    case 'max':
      return 'max';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'free';
  }
}

export function getAllowedAutoModesForTier(tier: string | null | undefined): string[] {
  const normalizedTier = normalizeSubscriptionTier(tier);
  if (normalizedTier === 'max' || normalizedTier === 'enterprise') {
    return ['auto-economy', 'auto-balanced', 'auto-premium'];
  }
  if (normalizedTier === 'pro') {
    return ['auto-economy', 'auto-balanced'];
  }
  return ['auto-economy'];
}

export function getBestAutoModeForTier(tier: string | null | undefined): string {
  const allowedAutoModes = getAllowedAutoModesForTier(tier);
  return allowedAutoModes[allowedAutoModes.length - 1] ?? 'auto-economy';
}
