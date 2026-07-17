/**
 * LLM constants for web — consumes the generated compatibility catalog.
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
  /**
   * Mirrors ModelMetadata.requiresEnvironment from @agiworkforce/types.
   * Absent on all current models; set on future env-gated models (Phase B).
   */
  requiresEnvironment?: 'e2b' | 'local-runtime';
  /** Additive per-model reasoning capability metadata (drives the effort flyout). */
  reasoning?: ModelReasoning;
  /** Selectability axis (separate from lifecycle status). Absent ⇒ "live". */
  availability?: ModelAvailability;
  /** Reason shown on coming_soon/unavailable rows. */
  unavailableReason?: string;
  /** Optional display-only expected-live date for coming_soon rows. */
  expectedLiveDate?: string;
}

// ---- Derived data from JSON ----

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
  Object.entries(MODEL_METADATA).map(([id, m]) => [id, m.contextWindow]),
);

// ---- Helper functions ----

export function getModelMetadata(modelId: string): ModelMetadata | null {
  return (getModelMetadataById(modelId) as ModelMetadata | null) ?? null;
}

/** Per-model reasoning capability block (absent ⇒ non-reasoning `none`). */
export function getModelReasoning(modelId: string | null | undefined): ModelReasoning {
  return getCatalogModelReasoning(modelId);
}

/** DISPLAY models — includes coming_soon (drives the picker list). */
export function getDisplayModels(): ModelMetadata[] {
  return getCatalogDisplayModels() as unknown as ModelMetadata[];
}

/** SELECTABLE models — live only (what can actually be picked/sent). */
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
  // Free users chat on the direct Gemini 3.1 Flash Lite model (not the managed
  // auto-economy preset). Keeping the default + reset on the same id avoids a flip.
  if (normalizeSubscriptionTier(tier) === 'free') return FREE_TRIAL_MODEL;
  const allowedAutoModes = getAllowedAutoModesForTier(tier);
  return allowedAutoModes[allowedAutoModes.length - 1] ?? 'auto-economy';
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
