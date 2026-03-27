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

export const modelsCatalog = modelsCatalogJson as ModelsCatalog;

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
