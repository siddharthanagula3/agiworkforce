/**
 * LLM Constants — thin shim over the canonical models.json (single source of truth)
 *
 * Generated model data is consumed from packages/contracts/types/src/models.json through
 * @agiworkforce/types. Authoring lives in packages/ai/model-registry/catalog; this
 * file re-exports it with the same named exports
 * that the 29+ TS importers expect.
 *
 * To add a new model, edit the model-registry curation/evidence inputs and run
 * pnpm sync:models. Never edit the generated models.json directly.
 */

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
  type ModelEnvironment,
} from '@agiworkforce/types';

export type { EnvironmentAvailability, ModelEnvironment };
export { evaluateModelEnvironment };

// ---- Types (unchanged from original) ----

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
  contextWindow: number;
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
  /** Mirrors the optional `deprecated` flag in models.json. */
  deprecated?: boolean;
  /**
   * GATING signal: if set, this model's agentic value depends on the named
   * execution environment being live. Pickers must gray it out when the
   * environment is not configured + available. Absent = no gating (every
   * current model). Mirrors ModelMetadata.requiresEnvironment from
   * @agiworkforce/types/model-catalog.
   */
  requiresEnvironment?: 'e2b' | 'local-runtime';
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

/** Selectable Managed Cloud Auto control projected from routing policy. */
export function getManagedAutoModelOptions(): ModelOption[] {
  return MANAGED_AUTO_MODEL_OPTIONS.map((option) => ({ ...option }));
}

/** Current selectable models for one provider, sourced from the canonical tier roster. */
export function getProviderModelOptions(provider: Provider): ModelOption[] {
  if (provider === 'managed_cloud') {
    return getManagedAutoModelOptions();
  }

  return CURRENT_PICKER_MODEL_OPTIONS.filter((option) => option.provider === provider).map(
    ({ value, label }) => ({ value, label }),
  );
}

/** Current Auto control and provider models for grouped Desktop controls. */
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
  Object.entries(MODEL_METADATA).map(([id, m]) => [id, m.contextWindow]),
);

// ---- Tier logic (reads arrays from JSON) ----

/**
 * Every model any subscription roster can offer, in catalog order.
 *
 * Only a universe to filter — the cascade itself is NOT rebuilt here. A local
 * `TIER_ALLOWED_MODELS` table used to union these three rosters per tier, which
 * put a second answer to "what may this plan select" in the same file as
 * `isModelAllowedForTier`; once that function started reading each model's
 * `tierPolicy.minTier` the two disagreed for Free (roster said 5 Economy models,
 * gate refused 2 of them).
 */
const SELECTABLE_MODELS: readonly string[] = Array.from(
  new Set([
    ...getCatalogAllowedModelsForTier('economy'),
    ...getCatalogAllowedModelsForTier('pro_additions'),
    ...getCatalogAllowedModelsForTier('flagship_additions'),
  ]),
);

// ---- Helper functions (unchanged signatures) ----

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

export function isModelAllowedForTier(modelId: string, tier: SubscriptionTier): boolean {
  // Delegated, not re-derived (apps/web/shared/config/llm.ts does the same). The
  // local cascade collapsed Free into Basic and so sold Free the whole Economy
  // roster, while the catalog gate also weighs each model's `tierPolicy.minTier`
  // — the field FREE_TRIAL_MODELS is built from. Two Economy models carry
  // minTier 'basic', so the copy here let a Free desktop pick models the server
  // refuses.
  return canAccessModelForSubscriptionTier(modelId, tier);
}

/**
 * The models `tier` may select — by construction the exact set for which
 * `isModelAllowedForTier` answers true, so a roster and the gate that enforces
 * it can never drift apart again. 'local-only' and 'byok' get an empty list:
 * the managed-cloud gate fails closed for them (they route through the user's
 * own keys), and pretending otherwise is what made the old table wrong.
 */
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
  // One self-routing "Auto" for every tier. Tier no longer picks an Auto
  // *profile* — the resolver derives the profile per task and clamps it to the
  // plan's reachable slots, so every user sees a single "Auto" option.
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

// ---------------------------------------------------------------------------
// Environment gating (Phase A — Phase B replaces environmentAvailability with
// the real managed-compute-beta signal once the E2B client is wired in).
// ---------------------------------------------------------------------------

/**
 * Return the current availability of a model's required execution environment.
 *
 * PHASE A: returns { configured: false } for every environment, locking all
 * env-gated models until Phase B wires the real managed-compute-beta signal.
 * No current model sets requiresEnvironment, so this never triggers today.
 *
 * PHASE B: replace the body with a hook/context read that checks whether the
 * managed-compute beta is enabled for the current user and whether E2B is
 * currently reachable, then return { configured: true, available: <ping> }.
 */
export function environmentAvailability(_env: ModelEnvironment): EnvironmentAvailability {
  // Phase A: all environments are unconfigured — env-gated models stay locked.
  return { configured: false };
}

/**
 * Pure function: given a model's metadata, return whether it is selectable
 * under the current (Phase A) environment availability, and why not if locked.
 *
 * Keeping this separate from tier logic means callers (pickers, tests) can
 * consume a single, predictable seam — no gating leak is possible from a
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
