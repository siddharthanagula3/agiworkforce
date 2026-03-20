/**
 * Shared model catalog types for the AGI Workforce platform.
 *
 * These types define the canonical shape for model metadata, provider
 * configuration, and capability representation. The single source of
 * truth for model data is `apps/web/constants/models.json` (also
 * embedded in the Rust binary via `include_str!`).
 *
 * All surfaces should use these types when referencing model metadata.
 *
 * Canonical source: this file.
 * Consumed by:
 *   - apps/desktop/src/constants/llm.ts (re-exports from models.json)
 *   - apps/desktop/src-tauri/src/core/llm/models_config.rs (Rust mirror)
 *   - apps/web/constants/models.json (raw data)
 *   - apps/mobile/ (via API responses)
 */

/** Provider identifiers used across the platform. */
export type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'xai'
  | 'deepseek'
  | 'qwen'
  | 'moonshot'
  | 'perplexity'
  | 'zhipu'
  | 'managed_cloud'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'cerebras'
  | 'deepinfra'
  | 'nvidia_nim'
  | 'open_router'
  | 'cohere'
  | 'ai21'
  | 'sambanova'
  | 'azure'
  | 'bedrock';

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
  version: string;
  lastUpdated: string;
  providers: Record<string, ProviderConfig>;
  models: Record<string, ModelMetadata>;
  tierAllowedModels: TierAllowedModels;
  modelPresets: Record<string, Array<{ value: string; label: string }>>;
  providersInOrder: string[];
}
