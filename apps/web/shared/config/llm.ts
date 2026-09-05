/**
 * LLM constants for web: consumes the generated compatibility catalog.
 *
 * Canonical authoring lives in packages/ai/model-registry/catalog. Its compiler
 * emits packages/contracts/types/src/models.json, re-exported as `modelsCatalogJson` from
 * @agiworkforce/types.
 * This file imports it and re-exports with the same API as the desktop shim.
 */

import { FREE_TRIAL_MODEL } from '@/lib/free-trial-config';
import {
  canAccessManualModelSelection as canAccessCatalogManualModelSelection,
  canAccessModelForSubscriptionTier,
  getManagedCloudProviderIds as getCatalogManagedCloudProviderIds,
  getManualOverrideModels as getCatalogManualOverrideModels,
  getModelMetadataById,
  getProviderDefaultModel as getCatalogProviderDefaultModel,
  getTaskModelForProvider as getCatalogTaskModelForProvider,
  getTierPolicy as getCatalogTierPolicy,
  normalizeSubscriptionAccessTier,
  getModelReasoning as getCatalogModelReasoning,
  splitEffortsByEntitlement as splitCatalogEffortsByEntitlement,
  type EffortEntitlement,
  getDisplayModels as getCatalogDisplayModels,
  getSelectableModels as getCatalogSelectableModels,
  isAutoModeModelId as isCatalogAutoModeModelId,
  modelIdAliases,
  modelsById,
  modelsCatalogJson as modelsJson,
  normalizeModelId as normalizeCatalogModelId,
  providerLabels,
  type ModelReasoning,
  type ModelAvailability,
  type ModelCapabilities,
} from '@agiworkforce/types';

export type { ModelCapabilities };

export interface ModelMetadata {
  id: string;
  apiModelId?: string;
  maxOutputTokens?: number;
  name: string;
  provider: string;
  modelType: string;
  contextWindow?: number;
  inputCost: number;
  outputCost: number;
  capabilities: ModelCapabilities;
  benchmarks?: Record<string, number>;
  speed: string;
  quality: string;
  qualityTier: string;
  bestFor: string[];
  released?: string;
  requiresEnvironment?: 'e2b' | 'local-runtime';
  reasoning?: ModelReasoning;
  availability?: ModelAvailability;
  unavailableReason?: string;
  expectedLiveDate?: string;
}

const config = modelsJson;

export const MODEL_ID_ALIASES: Record<string, string> = modelIdAliases;

export function normalizeModelId(modelId: string | null | undefined): string | null {
  return normalizeCatalogModelId(modelId);
}

export function isAutoModeModelId(modelId: string | null | undefined): boolean {
  return isCatalogAutoModeModelId(modelId);
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

export const THINKING_MODEL_VARIANTS: Record<string, string> = {};

export const PROVIDERS_IN_ORDER: string[] = config.providersInOrder;

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = Object.fromEntries(
  Object.entries(MODEL_METADATA).flatMap(([id, model]) => {
    const contextWindow = model.contextWindow;
    return typeof contextWindow === 'number' && Number.isFinite(contextWindow) && contextWindow > 0
      ? [[id, contextWindow]]
      : [];
  }),
);

export function getModelMetadata(modelId: string): ModelMetadata | null {
  return (getModelMetadataById(modelId) as ModelMetadata | null) ?? null;
}

export function getModelReasoning(modelId: string | null | undefined): ModelReasoning {
  return getCatalogModelReasoning(modelId);
}

export function splitEffortsByEntitlement(
  reasoning: ModelReasoning,
  tier: string | null | undefined,
): EffortEntitlement {
  return splitCatalogEffortsByEntitlement(reasoning, tier);
}

export function getDisplayModels(): ModelMetadata[] {
  return getCatalogDisplayModels() as unknown as ModelMetadata[];
}

export function getSelectableModels(): ModelMetadata[] {
  return getCatalogSelectableModels() as unknown as ModelMetadata[];
}

export function getAllModels(): ModelMetadata[] {
  return Object.values(CANONICAL_MODEL_METADATA);
}

export function getProviderModels(provider: string): ModelMetadata[] {
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

export function isModelAllowedForTier(modelId: string, tier: string): boolean {
  return canAccessModelForSubscriptionTier(modelId, tier);
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
  return normalizeSubscriptionAccessTier(tier ?? 'free');
}

export function getAllowedAutoModesForTier(_tier: string | null | undefined): string[] {
  return ['auto'];
}

export function getBestAutoModeForTier(tier: string | null | undefined): string {
  if (normalizeSubscriptionTier(tier) === 'free') return FREE_TRIAL_MODEL;
  return 'auto';
}

export function canAccessManualModelSelection(tier: string | null | undefined): boolean {
  return canAccessCatalogManualModelSelection(tier);
}

export function getManagedCloudProviderIds(
  options: { includeSearchProviders?: boolean } = {},
): string[] {
  return getCatalogManagedCloudProviderIds(options);
}

export function getManualOverrideModels(
  options: { includeSearch?: boolean } = {},
): ModelMetadata[] {
  return getCatalogManualOverrideModels(options) as ModelMetadata[];
}

export function getTierPolicy(tier: string | null | undefined) {
  return getCatalogTierPolicy(tier);
}
