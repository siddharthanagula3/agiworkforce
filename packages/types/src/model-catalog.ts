/**
 * Shared model catalog types for the AGI Workforce platform.
 *
 * These types define the canonical shape for model metadata, provider
 * configuration, and capability representation. The single source of
 * truth for model data is `packages/types/src/models.json`, re-exported
 * as `modelsCatalogJson` from this package (also embedded in the Rust
 * binary via `include_str!`).
 *
 * All surfaces should use these types when referencing model metadata.
 *
 * Canonical source: this file (types) + ./models.json (data).
 * Consumed by:
 *   - apps/desktop/src/constants/llm.ts (imports modelsCatalogJson)
 *   - apps/desktop/src-tauri/src/core/llm/models_config.rs (Rust mirror)
 *   - apps/web/constants/llm.ts (imports modelsCatalogJson)
 *   - apps/web/app/api/models/route.ts (imports modelsCatalogJson)
 *   - apps/mobile/ (via API responses)
 */

// Provider is the canonical union type for all LLM provider identifiers.
// It lives in its own module so surfaces can import it without pulling in
// the full model catalog schema.
import modelsCatalogJson from './models.json';
import type { Provider } from './provider';
export type { Provider };

/** Boolean capability flags for a model. */
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

/** Model type categories. */
export type ModelType =
  | 'chat'
  | 'code'
  | 'reasoning'
  | 'multimodal'
  | 'image'
  | 'video'
  | 'search'
  | 'tts'
  | 'stt'
  | 'music';

/** Speed tier for a model. */
export type ModelSpeed = 'very-fast' | 'fast' | 'medium' | 'slow';

/** Quality tier for a model. */
export type ModelQuality = 'excellent' | 'good' | 'fair';

/** Quality tier category for routing decisions. */
export type ModelQualityTier = 'fast' | 'balanced' | 'best';
export type PickerModelTier = 'economy' | 'balanced' | 'premium';

/** Benchmark scores for a model (all optional). */
export interface ModelBenchmarks {
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
}

/** Lifecycle status of a model. */
export type ModelStatus = 'active' | 'beta' | 'deprecated';

/** Full model metadata entry as defined in models.json. */
export interface ModelMetadata {
  id: string;
  /** Optional API-specific model ID (e.g., "mistral-medium-2508"). */
  apiModelId?: string;
  name: string;
  provider: Provider;
  modelType: ModelType;
  contextWindow: number;
  /** Maximum output tokens the model can generate per request. */
  maxOutputTokens?: number;
  /** Cost per million input tokens (USD). */
  inputCost: number;
  /** Cost per million output tokens (USD). */
  outputCost: number;
  capabilities: ModelCapabilities;
  benchmarks?: ModelBenchmarks;
  speed: ModelSpeed;
  quality: ModelQuality;
  qualityTier: ModelQualityTier;
  bestFor: string[];
  /** Optional preferred adjacent model for quality/speed cycling. */
  variantPartner?: string;
  /** Release date string (e.g., "2026-03"). */
  released?: string;
  deprecated?: boolean;
  /** Lifecycle status. Defaults to 'active' if omitted. */
  status?: ModelStatus;
}

/**
 * Provider health status used by provider management UIs and health checks.
 *
 * @example
 * ```typescript
 * const status: ProviderHealthStatus = {
 *   provider: 'anthropic',
 *   available: true,
 *   configured: true,
 *   healthCheckedAt: Date.now(),
 * };
 * ```
 */
export interface ProviderHealthStatus {
  /** Provider identifier. */
  provider: Provider | string;
  /** Whether the provider API is currently reachable. */
  available: boolean;
  /** Whether an API key has been configured. */
  configured: boolean;
  /** Error message if the provider is unhealthy. */
  error?: string;
  /** Remaining rate limit quota (if reported by the provider). */
  rateLimitRemaining?: number;
  /** ISO 8601 timestamp when rate limit resets. */
  rateLimitReset?: string;
  /** Timestamp (ms since epoch) of the last health check. */
  healthCheckedAt?: number;
}

/** Per-provider pricing defaults. */
export interface ProviderPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Token estimation multipliers per provider. */
export interface TokenMultiplier {
  prompt: number;
  completion: number;
}

/** Task-specific model routing per provider. */
export interface TaskRouting {
  fast_completion?: string;
  code_generation?: string;
  complex_reasoning?: string;
  chat?: string;
  vision?: string;
  long_context?: string;
}

/** Per-provider configuration from models.json. */
export interface ProviderConfig {
  label: string;
  sseDelimiter?: string;
  tokenMultiplier?: TokenMultiplier;
  defaultPricing?: ProviderPricing;
  modelPrefixes?: string[];
  aliases?: string[];
  defaultModel?: string;
  taskRouting?: TaskRouting;
  canonicalization?: Record<string, string>;
}

/** Tier visibility configuration. */
export interface TierAllowedModels {
  economy: string[];
  pro_additions: string[];
  flagship_additions: string[];
}

/** Top-level models.json schema. */
export interface ModelsCatalog {
  version: number | string;
  lastUpdated: string;
  providers: Record<string, ProviderConfig>;
  models: Record<string, ModelMetadata>;
  tierAllowedModels: TierAllowedModels;
  modelPresets: Record<string, Array<{ value: string; label: string }>>;
  providersInOrder: string[];
}

type TierKey = keyof TierAllowedModels;

export interface PickerModelView {
  id: string;
  name: string;
  provider: Provider | string;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  tier: PickerModelTier;
  released: string | null;
}

export interface PickerModelOptions {
  includeDeprecated?: boolean;
  includeSearchModels?: boolean;
  allowedProviders?: Array<Provider | string>;
  modelTypes?: ModelType[];
}

export interface ModelCostRate {
  input: number;
  output: number;
  provider: Provider | string;
}

export interface RuntimeFallbackModel {
  model: string;
  provider: Provider | string;
  inputCost: number;
  outputCost: number;
}

export interface ModelQueryOptions {
  includeDeprecated?: boolean;
  modelTypes?: ModelType[];
  requireCapabilities?: Partial<Record<keyof ModelCapabilities, boolean>>;
}

export type AutoModeModelId = 'auto' | 'auto-economy' | 'auto-balanced' | 'auto-premium';

export const modelsCatalog = modelsCatalogJson as ModelsCatalog;
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const AUTO_MODE_IDS = new Set<AutoModeModelId>([
  'auto',
  'auto-economy',
  'auto-balanced',
  'auto-premium',
]);

function resolveCanonicalTarget(target: string): string {
  if (modelsCatalog.models[target]) {
    return target;
  }

  const byApiModelId = Object.entries(modelsCatalog.models).find(
    ([, metadata]) => metadata.apiModelId === target,
  );

  return byApiModelId?.[0] ?? target;
}

export const modelIdAliases: Record<string, string> = (() => {
  const aliases: Record<string, string> = {};

  for (const [modelId, metadata] of Object.entries(modelsCatalog.models)) {
    aliases[modelId] = modelId;
    if (metadata.apiModelId) {
      aliases[metadata.apiModelId] = modelId;
    }
  }

  for (const providerConfig of Object.values(modelsCatalog.providers)) {
    for (const [alias, target] of Object.entries(providerConfig.canonicalization ?? {})) {
      aliases[alias] = resolveCanonicalTarget(target);
    }
  }

  return aliases;
})();

export function normalizeModelId(modelId: string | null | undefined): string | null {
  if (!modelId) {
    return null;
  }

  return modelIdAliases[modelId] ?? resolveCanonicalTarget(modelId);
}

export function getModelMetadataById(modelId: string | null | undefined): ModelMetadata | null {
  const canonicalModelId = normalizeModelId(modelId);
  if (!canonicalModelId) {
    return null;
  }

  return modelsCatalog.models[canonicalModelId] ?? null;
}

export const modelsById: Record<string, ModelMetadata> = (() => {
  const entries: Array<[string, ModelMetadata]> = [];

  for (const [modelId, metadata] of Object.entries(modelsCatalog.models)) {
    entries.push([modelId, metadata]);
  }

  for (const [alias, canonicalModelId] of Object.entries(modelIdAliases)) {
    const metadata = modelsCatalog.models[canonicalModelId];
    if (metadata) {
      entries.push([alias, metadata]);
    }
  }

  return Object.fromEntries(entries);
})();

export const providerLabels: Record<string, string> = Object.fromEntries(
  Object.entries(modelsCatalog.providers).map(([providerId, providerConfig]) => [
    providerId,
    providerConfig.label,
  ]),
);

export const PROVIDERS_IN_ORDER = [...modelsCatalog.providersInOrder];

export function getProviderConfig(provider: Provider | string): ProviderConfig | null {
  return modelsCatalog.providers[provider] ?? null;
}

export function getProviderDefaultModel(provider: Provider | string): string | null {
  return normalizeModelId(getProviderConfig(provider)?.defaultModel);
}

export function getTaskModelForProvider(
  provider: Provider | string,
  task: keyof TaskRouting,
): string | null {
  const providerConfig = getProviderConfig(provider);
  if (!providerConfig) {
    return null;
  }

  return normalizeModelId(providerConfig.taskRouting?.[task] ?? providerConfig.defaultModel);
}

function normalizeModelList(modelIds: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const modelId of modelIds) {
    const canonicalModelId = normalizeModelId(modelId);
    if (!canonicalModelId || seen.has(canonicalModelId)) {
      continue;
    }
    seen.add(canonicalModelId);
    normalized.push(canonicalModelId);
  }

  return normalized;
}

export function getAllowedModelsForTier(tier: TierKey): string[] {
  return normalizeModelList(modelsCatalog.tierAllowedModels[tier] ?? []);
}

export function isModelAllowedForTier(modelId: string, tier: TierKey): boolean {
  const canonicalModelId = normalizeModelId(modelId);
  if (!canonicalModelId) {
    return false;
  }

  return getAllowedModelsForTier(tier).includes(canonicalModelId);
}

export function listCanonicalModels(): ModelMetadata[] {
  return Object.values(modelsCatalog.models);
}

export function getModels(options: ModelQueryOptions = {}): ModelMetadata[] {
  return listCanonicalModels().filter((model) => matchesModelQueryOptions(model, options));
}

function matchesModelQueryOptions(model: ModelMetadata, options: ModelQueryOptions = {}): boolean {
  const { includeDeprecated = false, modelTypes, requireCapabilities } = options;

  if (!includeDeprecated && model.status === 'deprecated') {
    return false;
  }

  if (modelTypes?.length && !modelTypes.includes(model.modelType)) {
    return false;
  }

  if (requireCapabilities) {
    for (const [capability, required] of Object.entries(requireCapabilities)) {
      if (
        required !== undefined &&
        model.capabilities[capability as keyof ModelCapabilities] !== required
      ) {
        return false;
      }
    }
  }

  return true;
}

export function getModelsForProvider(
  provider: Provider | string,
  options: ModelQueryOptions = {},
): ModelMetadata[] {
  return getModels(options).filter((model) => model.provider === provider);
}

export function getModelIdsForProvider(
  provider: Provider | string,
  options: ModelQueryOptions = {},
): string[] {
  return getModelsForProvider(provider, options).map((model) => model.id);
}

export function isModelSupportedByProvider(
  provider: Provider | string,
  modelId: string | null | undefined,
  options: ModelQueryOptions = {},
): boolean {
  const canonicalModelId = normalizeModelId(modelId);
  if (!canonicalModelId) {
    return false;
  }

  return getModelsForProvider(provider, options).some((model) => model.id === canonicalModelId);
}

export function detectProviderFromModelId(
  modelId: string | null | undefined,
): Provider | string | null {
  const metadata = getModelMetadataById(modelId);
  return metadata?.provider ?? null;
}

export function getModelVariantPartner(modelId: string | null | undefined): string | null {
  const metadata = getModelMetadataById(modelId);
  return normalizeModelId(metadata?.variantPartner);
}

export function getProviderProbeModel(provider: Provider | string): string | null {
  return getTaskModelForProvider(provider, 'fast_completion') ?? getProviderDefaultModel(provider);
}

export function getEconomyFallbackModels(): RuntimeFallbackModel[] {
  return getAllowedModelsForTier('economy')
    .map((modelId) => getModelMetadataById(modelId))
    .filter((model): model is ModelMetadata => {
      if (!model) {
        return false;
      }

      return (
        model.status !== 'deprecated' &&
        ['chat', 'code', 'reasoning', 'multimodal'].includes(model.modelType) &&
        model.capabilities.tools
      );
    })
    .sort(
      (left, right) =>
        left.inputCost + left.outputCost - (right.inputCost + right.outputCost) ||
        right.contextWindow - left.contextWindow ||
        left.name.localeCompare(right.name),
    )
    .map((model) => ({
      model: model.id,
      provider: model.provider,
      inputCost: model.inputCost,
      outputCost: model.outputCost,
    }));
}

function normalizeSubscriptionTierKey(tier: string | null | undefined): TierKey | 'free' {
  switch ((tier ?? '').toLowerCase()) {
    case 'pro':
      return 'pro_additions';
    case 'max':
    case 'enterprise':
      return 'flagship_additions';
    case 'free':
      return 'free';
    case 'hobby':
    default:
      return 'economy';
  }
}

export function resolveAutoModeModel(
  autoMode: AutoModeModelId | string | null | undefined,
  subscriptionTier?: string | null,
): string | null {
  const normalizedMode = (autoMode ?? 'auto-balanced').toLowerCase() as AutoModeModelId;
  const normalizedTier = normalizeSubscriptionTierKey(subscriptionTier);

  if (!AUTO_MODE_IDS.has(normalizedMode)) {
    return normalizeModelId(normalizedMode);
  }

  if (
    normalizedTier === 'free' &&
    (normalizedMode === 'auto-balanced' || normalizedMode === 'auto-premium')
  ) {
    return resolveAutoModeModel('auto-economy', subscriptionTier);
  }

  if (
    normalizedTier === 'economy' &&
    (normalizedMode === 'auto-balanced' || normalizedMode === 'auto-premium')
  ) {
    return resolveAutoModeModel('auto-economy', subscriptionTier);
  }

  if (normalizedTier === 'pro_additions' && normalizedMode === 'auto-premium') {
    return resolveAutoModeModel('auto-balanced', subscriptionTier);
  }

  switch (normalizedMode) {
    case 'auto':
    case 'auto-balanced':
      return (
        getTaskModelForProvider('openai', 'chat') ??
        getTaskModelForProvider('managed_cloud', 'chat') ??
        'gpt-5.4'
      );
    case 'auto-premium':
      return (
        getTaskModelForProvider('anthropic', 'complex_reasoning') ??
        getTaskModelForProvider('openai', 'complex_reasoning') ??
        getTaskModelForProvider('anthropic', 'chat') ??
        'claude-opus-4.6'
      );
    case 'auto-economy':
    default:
      return (
        getTaskModelForProvider('openai', 'fast_completion') ??
        getTaskModelForProvider('managed_cloud', 'fast_completion') ??
        'gpt-5.4-mini'
      );
  }
}

export function getPickerModelTier(modelId: string | null | undefined): PickerModelTier {
  const canonicalModelId = normalizeModelId(modelId);
  if (!canonicalModelId) {
    return 'economy';
  }

  if (isModelAllowedForTier(canonicalModelId, 'flagship_additions')) {
    return 'premium';
  }

  if (isModelAllowedForTier(canonicalModelId, 'pro_additions')) {
    return 'balanced';
  }

  if (isModelAllowedForTier(canonicalModelId, 'economy')) {
    return 'economy';
  }

  const qualityTier = getModelMetadataById(canonicalModelId)?.qualityTier;
  if (qualityTier === 'best') {
    return 'premium';
  }
  if (qualityTier === 'balanced') {
    return 'balanced';
  }
  return 'economy';
}

function getUnifiedAllowedModelIds(): string[] {
  return normalizeModelList([
    ...getAllowedModelsForTier('economy'),
    ...getAllowedModelsForTier('pro_additions'),
    ...getAllowedModelsForTier('flagship_additions'),
  ]);
}

export function getPickerModels(options: PickerModelOptions = {}): PickerModelView[] {
  const {
    includeDeprecated = false,
    includeSearchModels = true,
    allowedProviders,
    modelTypes = ['chat', 'reasoning', 'multimodal', 'search'],
  } = options;

  const allowedProviderSet = allowedProviders ? new Set(allowedProviders) : null;
  const allowedTypes = new Set(
    includeSearchModels ? modelTypes : modelTypes.filter((type) => type !== 'search'),
  );
  const providerOrder = new Map(
    modelsCatalog.providersInOrder.map((providerId, index) => [providerId, index]),
  );
  const tierOrder: Record<PickerModelTier, number> = {
    economy: 0,
    balanced: 1,
    premium: 2,
  };

  return getUnifiedAllowedModelIds()
    .map((modelId) => getModelMetadataById(modelId))
    .filter((model): model is ModelMetadata => Boolean(model))
    .filter((model) => includeDeprecated || model.status !== 'deprecated')
    .filter((model) => allowedTypes.has(model.modelType))
    .filter((model) => (allowedProviderSet ? allowedProviderSet.has(model.provider) : true))
    .sort((left, right) => {
      const providerDiff =
        (providerOrder.get(left.provider) ?? Number.MAX_SAFE_INTEGER) -
        (providerOrder.get(right.provider) ?? Number.MAX_SAFE_INTEGER);
      if (providerDiff !== 0) {
        return providerDiff;
      }

      const tierDiff =
        tierOrder[getPickerModelTier(left.id)] - tierOrder[getPickerModelTier(right.id)];
      if (tierDiff !== 0) {
        return tierDiff;
      }

      return left.name.localeCompare(right.name);
    })
    .map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      contextWindow: model.contextWindow,
      maxOutput: model.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      supportsVision: model.capabilities.vision,
      supportsThinking: model.capabilities.thinking,
      tier: getPickerModelTier(model.id),
      released: model.released ?? null,
    }));
}

export function getModelContextLimits(modelIds?: string[]): Record<string, number> {
  const ids = modelIds?.length ? normalizeModelList(modelIds) : Object.keys(modelsCatalog.models);
  const entries: Array<[string, number]> = [];

  for (const modelId of ids) {
    const metadata = getModelMetadataById(modelId);
    if (!metadata) {
      continue;
    }
    entries.push([metadata.id, metadata.contextWindow]);
  }

  return Object.fromEntries(entries);
}

export function getModelCostRates(modelIds?: string[]): Record<string, ModelCostRate> {
  const ids = modelIds?.length ? normalizeModelList(modelIds) : Object.keys(modelsCatalog.models);
  const entries: Array<[string, ModelCostRate]> = [];

  for (const modelId of ids) {
    const metadata = getModelMetadataById(modelId);
    if (!metadata) {
      continue;
    }
    entries.push([
      metadata.id,
      {
        input: metadata.inputCost,
        output: metadata.outputCost,
        provider: metadata.provider,
      },
    ]);
  }

  return Object.fromEntries(entries);
}
