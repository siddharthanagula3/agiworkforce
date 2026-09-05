import type { Provider } from '../types/provider';
import type { SubscriptionTier } from './planModels';
import {
  canAccessManualModelSelection as canAccessCatalogManualModelSelection,
  canAccessModelForSubscriptionTier,
  evaluateModelEnvironment,
  getAutoRoutingProfiles as getCatalogAutoRoutingProfiles,
  getAllowedModelsForTier as getCatalogAllowedModelsForTier,
  getManagedCloudProviderIds as getCatalogManagedCloudProviderIds,
  getManualOverrideModels as getCatalogManualOverrideModels,
  getModelMetadataById,
  getModelVariantPartner as getCatalogModelVariantPartner,
  getPickerModels as getCatalogPickerModels,
  getProviderDefaultModel as getCatalogProviderDefaultModel,
  getTaskModelForProvider as getCatalogTaskModelForProvider,
  getTierPolicy as getCatalogTierPolicy,
  modelIdAliases,
  modelsById,
  modelsCatalogJson as modelsJson,
  normalizeSubscriptionAccessTier,
  normalizeModelId as normalizeCatalogModelId,
  providerLabels,
  type EnvironmentAvailability,
  type ModelCapabilities,
  type ModelEnvironment,
} from '@agiworkforce/types';

export type { EnvironmentAvailability, ModelEnvironment };
export { evaluateModelEnvironment };

export type { ModelCapabilities };

export interface ModelMetadata {
  id: string;
  apiModelId?: string;
  maxOutputTokens?: number;
  name: string;
  provider: Provider;
  modelType:
    | 'chat'
    | 'code'
    | 'reasoning'
    | 'multimodal'
    | 'image'
    | 'video'
    | 'search'
    | 'tts'
    | 'stt'
    | 'embedding'
    | 'music';
  contextWindow?: number;
  inputCost: number;
  outputCost: number;
  capabilities: ModelCapabilities;
  benchmarks?: {
    swebench?: number;
    humaneval?: number;
    mmlu?: number;
    gpqa?: number;
    aime?: number;
    sweBenchPro?: number;
    terminalBench2?: number;
    osWorldVerified?: number;
    gdpvalWinsOrTies?: number;
    ctfChallenges?: number;
    sweLancerIcDiamond?: number;
    aiderPolyglot?: number;
    tau2Telecom?: number;
  };
  speed: 'very-fast' | 'fast' | 'medium' | 'slow';
  quality: 'excellent' | 'good' | 'fair';
  qualityTier: 'fast' | 'balanced' | 'best';
  bestFor: string[];
  released?: string;
  deprecated?: boolean;
  requiresEnvironment?: 'e2b' | 'local-runtime';
}

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

export const PROVIDER_LABELS: Record<Provider, string> = providerLabels as Record<Provider, string>;

export interface ModelOption {
  value: string;
  label: string;
}

export interface GroupedModelOption extends ModelOption {
  provider: Provider | string;
}

const CHAT_MODEL_TYPES = ['chat', 'code', 'reasoning', 'multimodal', 'search'] as const;

const MANAGED_AUTO_MODEL_OPTIONS: ModelOption[] = getCatalogAutoRoutingProfiles().map(
  (profile) => ({
    value: profile.id,
    label: profile.label,
  }),
);

const CURRENT_PICKER_MODEL_OPTIONS: GroupedModelOption[] = getCatalogPickerModels({
  modelTypes: [...CHAT_MODEL_TYPES],
}).map((model) => ({
  value: model.id,
  label: model.name,
  provider: model.provider,
}));

export function getManagedAutoModelOptions(): ModelOption[] {
  return MANAGED_AUTO_MODEL_OPTIONS.map((option) => ({ ...option }));
}

export function getProviderModelOptions(provider: Provider): ModelOption[] {
  if (provider === 'managed_cloud') {
    return getManagedAutoModelOptions();
  }

  return CURRENT_PICKER_MODEL_OPTIONS.filter((option) => option.provider === provider).map(
    ({ value, label }) => ({ value, label }),
  );
}

export function getCurrentModelOptions(): GroupedModelOption[] {
  return [
    ...MANAGED_AUTO_MODEL_OPTIONS.map((option) => ({
      ...option,
      provider: 'managed_cloud' as const,
    })),
    ...CURRENT_PICKER_MODEL_OPTIONS.map((option) => ({ ...option })),
  ];
}

export const THINKING_MODEL_VARIANTS: Record<string, string> = {};

export const PROVIDERS_IN_ORDER: Provider[] = config.providersInOrder as Provider[];

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = Object.fromEntries(
  Object.entries(MODEL_METADATA).flatMap(([id, model]) => {
    const contextWindow = model.contextWindow;
    return typeof contextWindow === 'number' && Number.isFinite(contextWindow) && contextWindow > 0
      ? [[id, contextWindow]]
      : [];
  }),
);

const SELECTABLE_MODELS: readonly string[] = Array.from(
  new Set([
    ...getCatalogAllowedModelsForTier('economy'),
    ...getCatalogAllowedModelsForTier('pro_additions'),
    ...getCatalogAllowedModelsForTier('flagship_additions'),
  ]),
);

export function getModelMetadata(modelId: string): ModelMetadata | null {
  return (getModelMetadataById(modelId) as ModelMetadata | null) ?? null;
}

export function getAllModels(): ModelMetadata[] {
  return Object.values(CANONICAL_MODEL_METADATA);
}

export function getProviderModels(provider: Provider): ModelMetadata[] {
  return getAllModels().filter((model) => model.provider === provider);
}

export function getModelContextWindow(modelId: string): number {
  const canonicalModelId = normalizeModelId(modelId);
  const metadata = canonicalModelId ? MODEL_METADATA[canonicalModelId] : undefined;
  const publishedContextWindow = canonicalModelId
    ? MODEL_CONTEXT_WINDOWS[canonicalModelId]
    : undefined;
  if (metadata && publishedContextWindow === undefined) {
    throw new Error(`Model ${canonicalModelId} does not publish a token context window`);
  }
  return publishedContextWindow ?? 128_000;
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

export function isModelAllowedForTier(modelId: string, tier: SubscriptionTier): boolean {
  return canAccessModelForSubscriptionTier(modelId, tier);
}

export function getAllowedModelsForTier(tier: SubscriptionTier): string[] {
  return SELECTABLE_MODELS.filter((modelId) => isModelAllowedForTier(modelId, tier));
}

export function getProviderDefaultModel(provider: Provider): string | null {
  return getCatalogProviderDefaultModel(provider);
}

export function getModelVariantPartner(modelId: string | null | undefined): string | null {
  return getCatalogModelVariantPartner(modelId);
}

export function getTaskModelForProvider(
  provider: Provider,
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

export function normalizeSubscriptionTier(
  tier: SubscriptionTier | string | null | undefined,
): SubscriptionTier {
  return normalizeSubscriptionAccessTier(tier ?? 'free') as SubscriptionTier;
}

export function getAllowedAutoModesForTier(
  _tier: SubscriptionTier | string | null | undefined,
): string[] {
  return ['auto'];
}

export function getBestAutoModeForTier(
  _tier: SubscriptionTier | string | null | undefined,
): string {
  return 'auto';
}

export function canAccessManualModelSelection(
  tier: SubscriptionTier | string | null | undefined,
): boolean {
  return canAccessCatalogManualModelSelection(tier);
}

export function getManagedCloudProviderIds(
  options: {
    includeSearchProviders?: boolean;
  } = {},
): Provider[] {
  return getCatalogManagedCloudProviderIds(options) as Provider[];
}

export function getManualOverrideModels(
  options: { includeSearch?: boolean } = {},
): ModelMetadata[] {
  return getCatalogManualOverrideModels(options) as ModelMetadata[];
}

export function getTierPolicy(tier: SubscriptionTier | string | null | undefined) {
  return getCatalogTierPolicy(tier);
}

export function environmentAvailability(_env: ModelEnvironment): EnvironmentAvailability {
  return { configured: false };
}

/**
 * Pure function: given a model's metadata, return whether it is selectable
 * under the current (Phase A) environment availability, and why not if locked.
 *
 * Keeping this separate from tier logic means callers (pickers, tests) can
 * consume a single, predictable seam, no gating leak is possible from a
 * partial update.
 *
 * CRITICAL SAFETY: models without requiresEnvironment are always environment-OK,
 * so no current model's appearance or selectability is altered.
 *
 * Returns:
 *   envSelectable: true  → no environment gate applies (proceed to tier check)
 *   envSelectable: false → locked; show `reason` as tooltip/badge copy
 */
export function getModelEnvironmentGate(model: Pick<ModelMetadata, 'requiresEnvironment'>): {
  envSelectable: boolean;
  reason?: string;
} {
  if (!model.requiresEnvironment) return { envSelectable: true };
  const result = evaluateModelEnvironment(
    model.requiresEnvironment,
    environmentAvailability(model.requiresEnvironment),
  );
  if (result.selectable) return { envSelectable: true };
  return { envSelectable: false, reason: result.reason };
}
