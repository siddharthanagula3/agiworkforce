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

export interface CoreModelOption {
  id: string;
  label: string;
  provider: Provider | string;
  providerLabel: string;
  description: string;
  detail: string;
}

export interface ModelQueryOptions {
  includeDeprecated?: boolean;
  modelTypes?: ModelType[];
  requireCapabilities?: Partial<Record<keyof ModelCapabilities, boolean>>;
}

export type AutoModeModelId = 'auto' | 'auto-economy' | 'auto-balanced' | 'auto-premium';
export type ProductTier = 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';
export type ProviderSurface = 'managed_cloud' | 'byok' | 'local' | 'hidden';
export type TierSurfaceMode = 'auto_only' | 'auto_plus_manual';
export type RoutingSlot =
  | 'general_fast'
  | 'general_balanced'
  | 'general_premium'
  | 'coding_fast'
  | 'coding_premium'
  | 'reasoning_premium'
  | 'creative_writing'
  | 'creative_writing_premium'
  | 'search_fast'
  | 'search_premium'
  | 'vision_fast'
  | 'vision_premium'
  | 'browser_dom'
  | 'computer_use'
  | 'computer_use_premium'
  | 'image_generation'
  | 'video_generation'
  | 'voice_transcription'
  | 'voice_rewrite';

export interface RoutingSlotDefinition {
  slot: RoutingSlot;
  label: string;
  description: string;
  modelId: string;
  provider: Provider | string;
}

export interface TierPolicy {
  tier: ProductTier;
  surfacedUx: TierSurfaceMode;
  allowedSlots: RoutingSlot[];
  allowedProviderSurfaces: ProviderSurface[];
  manualModelSelection: boolean;
  allowBrowserDom: boolean;
  allowComputerUse: boolean;
  allowSearch: boolean;
  allowMediaGeneration: boolean;
}

export const modelsCatalog = modelsCatalogJson as ModelsCatalog;
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const AUTO_MODE_IDS = new Set<AutoModeModelId>([
  'auto',
  'auto-economy',
  'auto-balanced',
  'auto-premium',
]);
const MANAGED_CLOUD_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'qwen',
  'moonshot',
  'deepseek',
  'perplexity',
  'zhipu',
] as const;
const SEARCH_ONLY_MANAGED_CLOUD_PROVIDER_IDS = ['perplexity'] as const;
const BYOK_PROVIDER_IDS = ['open_router', 'nvidia_nim'] as const;
const LOCAL_PROVIDER_IDS = ['ollama'] as const;
const MANAGED_CLOUD_PROVIDER_SET = new Set<string>([
  'managed_cloud',
  ...MANAGED_CLOUD_PROVIDER_IDS,
]);
const SEARCH_ONLY_MANAGED_CLOUD_PROVIDER_SET = new Set<string>(
  SEARCH_ONLY_MANAGED_CLOUD_PROVIDER_IDS,
);
const BYOK_PROVIDER_SET = new Set<string>(BYOK_PROVIDER_IDS);
const LOCAL_PROVIDER_SET = new Set<string>(LOCAL_PROVIDER_IDS);
// Derived from models.json (the locked source of truth). Surfacing every
// non-deprecated, non-experimental model lets the picker stay in sync with
// the catalog without a hand-typed parallel registry. Insertion order from
// the JSON is preserved so UI ordering remains stable.
const MANUAL_OVERRIDE_MODEL_IDS: readonly string[] = Object.entries(
  modelsCatalogJson.models as Record<string, ModelMetadata>,
)
  .filter(([, model]) => {
    if (model.deprecated) return false;
    if (model.status === 'deprecated') return false;
    // 'experimental' is not in the current ModelStatus union but guard for
    // future expansion so preview-only models are excluded.
    if ((model.status as string | undefined) === 'experimental') return false;
    return true;
  })
  .map(([id]) => id);
const MANUAL_OVERRIDE_MODEL_SET = new Set<string>(MANUAL_OVERRIDE_MODEL_IDS);

// ============================================================================
// SLOT_REGISTRY — Evidence-based model assignments
//
// Sources (May 2026):
//   Coding:          SWE-bench Verified / SWE-bench Pro / Aider Polyglot
//   Reasoning:       GPQA Diamond / HLE / Artificial Analysis Intelligence Index
//   Computer use:    OSWorld-Verified / ScreenSpot / TAU-bench
//   Vision:          MMMU-Pro / DocVQA / ChartQA / FACTS Grounding
//   Creative writing: EQ-Bench Creative Writing Elo
//   Search:          SimpleQA / FRAMES
//   Speed:           Artificial Analysis TTFT + tok/s benchmarks
//
// Pricing (blended $/M = weighted avg input+output):
//   Gemini 3.1 Pro:      $2/$12   → $5.33 blended
//   Claude Opus 4.7:     $5/$25   → $12.00 blended
//   Claude Sonnet 4.6:   $3/$15   → $7.50 blended
//   Claude Haiku 4.5:    $1/$5    → $2.50 blended
//   GPT-5.5:             $5/$30   → $14.00 blended
//   GPT-5.4-mini:        $0.75/$4.50 → $1.88 blended
//   GPT-5.4-codex:       $0.40/$1.60 → $0.80 blended (specialized coding model)
//   DeepSeek V3.2:       $0.27/$0.42 → $0.32 blended
//   Gemini 3.1 Flash:    $0.50/$3 → $1.25 blended
//   Gemini 3.1 Flash-Lite: $0.25/$1.50 → $0.56 blended
// ============================================================================
export const SLOT_REGISTRY: Record<RoutingSlot, RoutingSlotDefinition> = {
  // -------------------------------------------------------------------------
  // GENERAL — Gemini Flash-Lite wins on throughput (327 tok/s) + cost ($0.25/$1.50).
  // -------------------------------------------------------------------------
  general_fast: {
    slot: 'general_fast',
    label: 'General Fast',
    description: 'Lowest-cost lane. Gemini 3.1 Flash-Lite: 327 tok/s, $0.25/$1.50, 1M context.',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'google',
  },
  // GPT-5.4-mini: 49/60 Intelligence Index, TTFT 3.85s, 201 tok/s — best mid-tier balance.
  general_balanced: {
    slot: 'general_balanced',
    label: 'General Balanced',
    description: 'Mid-tier balanced lane. GPT-5.4-mini: 49/60 Intelligence Index, $0.75/$4.50.',
    modelId: 'gpt-5.4-mini',
    provider: 'openai',
  },
  // Gemini 3.1 Pro: 57/60 Intelligence Index — tied with Claude Opus 4.7 at 40% the cost ($2/$12 vs $5/$25).
  // Leads GPQA Diamond (94.3%), best long-context (holds 500K–1M tokens), FACTS Grounding winner.
  general_premium: {
    slot: 'general_premium',
    label: 'General Premium',
    description:
      'Premium intelligence lane. Gemini 3.1 Pro: 57/60 Intelligence Index, $2/$12 — same quality as Claude Opus 4.7 at 40% the cost.',
    modelId: 'gemini-3.1-pro-preview',
    provider: 'google',
  },

  // -------------------------------------------------------------------------
  // CODING — DeepSeek V3.2: ~70% SWE-bench at $0.27/$0.42 (10–25× cheaper than frontier).
  // GPT-5.4-codex: ~85% SWE-bench at $0.40/$1.60 (specialized coding model, best value at frontier).
  // -------------------------------------------------------------------------
  coding_fast: {
    slot: 'coding_fast',
    label: 'Coding Fast',
    description:
      'Budget coding lane. DeepSeek V3.2: ~70% SWE-bench Verified, $0.27/$0.42 — 10–25× cheaper than flagship.',
    modelId: 'deepseek-chat',
    provider: 'deepseek',
  },
  coding_premium: {
    slot: 'coding_premium',
    label: 'Coding Premium',
    description:
      'Premium coding lane. GPT-5.4-codex: ~85% SWE-bench, $0.40/$1.60 — specialized coding model with best price/benchmark at frontier.',
    modelId: 'gpt-5.4-codex',
    provider: 'openai',
  },

  // -------------------------------------------------------------------------
  // REASONING — Gemini 3.1 Pro wins on GPQA Diamond (94.3% vs 94.2% for Claude Opus 4.7)
  // AND costs 60% less ($2/$12 vs $5/$25). HLE-no-tools: Claude Opus 4.7 leads (46.9%).
  // For complex reasoning, benchmark evidence favors Gemini 3.1 Pro on cost-efficiency.
  // -------------------------------------------------------------------------
  reasoning_premium: {
    slot: 'reasoning_premium',
    label: 'Reasoning Premium',
    description:
      'Deep reasoning lane. Gemini 3.1 Pro: 94.3% GPQA Diamond (#1), $2/$12 — beats Claude Opus 4.7 (94.2%) at 40% the cost.',
    modelId: 'gemini-3.1-pro-preview',
    provider: 'google',
  },

  // -------------------------------------------------------------------------
  // CREATIVE WRITING — Claude leads unambiguously on EQ-Bench Creative Writing Elo.
  // Sonnet 4.6: 1991 Elo (balanced). Opus 4.7: 2216 Elo (+225 pts lead over GPT-5.5 at 2024).
  // -------------------------------------------------------------------------
  creative_writing: {
    slot: 'creative_writing',
    label: 'Creative Writing',
    description: 'Balanced creative lane. Claude Sonnet 4.6: EQ-Bench 1991 Elo, $3/$15.',
    modelId: 'claude-sonnet-4.6',
    provider: 'anthropic',
  },
  creative_writing_premium: {
    slot: 'creative_writing_premium',
    label: 'Creative Writing Premium',
    description:
      'Premium creative lane. Claude Opus 4.7: EQ-Bench 2216 Elo — 192 Elo points ahead of GPT-5.5 (2024), unambiguous leader.',
    modelId: 'claude-opus-4.7',
    provider: 'anthropic',
  },

  // -------------------------------------------------------------------------
  // SEARCH — Perplexity purpose-built for grounded QA. Sonar Deep Research: 93.9% SimpleQA.
  // -------------------------------------------------------------------------
  search_fast: {
    slot: 'search_fast',
    label: 'Search Fast',
    description:
      'Fast grounded search. Perplexity Sonar: purpose-built retrieval, $1/$1 + search fee.',
    modelId: 'sonar',
    provider: 'perplexity',
  },
  search_premium: {
    slot: 'search_premium',
    label: 'Search Premium',
    description:
      'Deep research. Perplexity Sonar Deep Research: 93.9% SimpleQA, multi-source synthesis with citations.',
    modelId: 'sonar-deep-research',
    provider: 'perplexity',
  },

  // -------------------------------------------------------------------------
  // VISION — Gemini 3.1 Pro leads FACTS Grounding (document-grounded generation) and
  // maintains 500K–1M token retrieval quality. All frontier models converged on MMMU-Pro (~81%).
  // -------------------------------------------------------------------------
  vision_fast: {
    slot: 'vision_fast',
    label: 'Vision Fast',
    description: 'Fast multimodal lane. Gemini 3.1 Flash-Lite: 1M context, $0.25/$1.50.',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'google',
  },
  vision_premium: {
    slot: 'vision_premium',
    label: 'Vision Premium',
    description:
      'Premium vision + long-doc lane. Gemini 3.1 Pro: FACTS Grounding #1, holds 500K–1M token context, $2/$12.',
    modelId: 'gemini-3.1-pro-preview',
    provider: 'google',
  },

  // -------------------------------------------------------------------------
  // BROWSER / COMPUTER USE — Claude family leads OSWorld (78% Opus 4.7, Claude Sonnet for cost).
  // GPT-5.4-mini had no OSWorld data and is a mini model — wrong choice for GUI automation.
  // -------------------------------------------------------------------------
  browser_dom: {
    slot: 'browser_dom',
    label: 'Browser DOM',
    description:
      'DOM automation lane. Claude Sonnet 4.6: best tool-use accuracy in Claude family, $3/$15.',
    modelId: 'claude-sonnet-4.6',
    provider: 'anthropic',
  },
  computer_use: {
    slot: 'computer_use',
    label: 'Computer Use',
    description:
      'Desktop automation lane. Claude Sonnet 4.6: Claude family leads OSWorld; Sonnet balances capability vs cost vs Opus 4.7.',
    modelId: 'claude-sonnet-4.6',
    provider: 'anthropic',
  },
  computer_use_premium: {
    slot: 'computer_use_premium',
    label: 'Computer Use Premium',
    description:
      'Premium desktop automation. Claude Opus 4.7: 78% OSWorld-Verified (#1 public model), 77.3% MCP-Atlas tool use.',
    modelId: 'claude-opus-4.7',
    provider: 'anthropic',
  },

  // -------------------------------------------------------------------------
  // MEDIA GENERATION — Best-in-class dedicated models.
  // -------------------------------------------------------------------------
  image_generation: {
    slot: 'image_generation',
    label: 'Image Generation',
    description: 'Image generation lane. GPT Image 1.5: integrated, strong text rendering.',
    modelId: 'gpt-image-1.5',
    provider: 'openai',
  },
  video_generation: {
    slot: 'video_generation',
    label: 'Video Generation',
    description: 'Video generation lane. Veo 3: Google DeepMind, state-of-the-art video quality.',
    modelId: 'veo-3',
    provider: 'google',
  },

  // -------------------------------------------------------------------------
  // VOICE — Whisper for STT; Gemini Flash-Lite for rewrite ($0.25/$1.50 vs GPT-4o-mini $0.75/$4.50 — 3× cheaper for simple cleanup).
  // -------------------------------------------------------------------------
  voice_transcription: {
    slot: 'voice_transcription',
    label: 'Voice Transcription',
    description: 'Speech-to-text. Whisper-1: battle-tested STT.',
    modelId: 'whisper-1',
    provider: 'openai',
  },
  voice_rewrite: {
    slot: 'voice_rewrite',
    label: 'Voice Rewrite',
    description:
      'Dictation cleanup lane. Gemini 3.1 Flash-Lite: 3× cheaper than GPT-5.4-mini for simple text rewriting, $0.25/$1.50.',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'google',
  },
};

export const TIER_POLICIES: Record<ProductTier, TierPolicy> = {
  free: {
    tier: 'free',
    surfacedUx: 'auto_only',
    allowedSlots: [
      'general_fast',
      'general_balanced',
      'coding_fast',
      'search_fast',
      'vision_fast',
      'voice_transcription',
      'voice_rewrite',
    ],
    allowedProviderSurfaces: ['managed_cloud'],
    manualModelSelection: false,
    allowBrowserDom: false,
    allowComputerUse: false,
    allowSearch: true,
    allowMediaGeneration: false,
  },
  hobby: {
    tier: 'hobby',
    surfacedUx: 'auto_only',
    allowedSlots: [
      'general_fast',
      'general_balanced',
      'coding_fast',
      'search_fast',
      'vision_fast',
      'voice_transcription',
      'voice_rewrite',
    ],
    allowedProviderSurfaces: ['managed_cloud'],
    manualModelSelection: false,
    allowBrowserDom: false,
    allowComputerUse: false,
    allowSearch: true,
    allowMediaGeneration: false,
  },
  pro: {
    tier: 'pro',
    surfacedUx: 'auto_only',
    allowedSlots: [
      'general_fast',
      'general_balanced',
      'coding_fast',
      'coding_premium',
      'reasoning_premium',
      'creative_writing',
      'creative_writing_premium',
      'search_fast',
      'search_premium',
      'vision_fast',
      'vision_premium',
      'browser_dom',
      'computer_use',
      'computer_use_premium',
      'voice_transcription',
      'voice_rewrite',
    ],
    allowedProviderSurfaces: ['managed_cloud'],
    manualModelSelection: false,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: false,
  },
  max: {
    tier: 'max',
    surfacedUx: 'auto_plus_manual',
    allowedSlots: [
      'general_fast',
      'general_balanced',
      'general_premium',
      'coding_fast',
      'coding_premium',
      'reasoning_premium',
      'creative_writing',
      'creative_writing_premium',
      'search_fast',
      'search_premium',
      'vision_fast',
      'vision_premium',
      'browser_dom',
      'computer_use',
      'computer_use_premium',
      'image_generation',
      'video_generation',
      'voice_transcription',
      'voice_rewrite',
    ],
    allowedProviderSurfaces: ['managed_cloud', 'byok', 'local'],
    manualModelSelection: true,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: true,
  },
  enterprise: {
    tier: 'enterprise',
    surfacedUx: 'auto_plus_manual',
    allowedSlots: [
      'general_fast',
      'general_balanced',
      'general_premium',
      'coding_fast',
      'coding_premium',
      'reasoning_premium',
      'creative_writing',
      'creative_writing_premium',
      'search_fast',
      'search_premium',
      'vision_fast',
      'vision_premium',
      'browser_dom',
      'computer_use',
      'computer_use_premium',
      'image_generation',
      'video_generation',
      'voice_transcription',
      'voice_rewrite',
    ],
    allowedProviderSurfaces: ['managed_cloud', 'byok', 'local'],
    manualModelSelection: true,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: true,
  },
};

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

// Module-load-time drift check: every SLOT_REGISTRY entry MUST point to a
// model that exists in models.json (or in modelIdAliases that resolve there).
// This makes catalog drift fail loudly at import time instead of silently
// routing to a phantom model. Aligns with rule-models-json.md.
(() => {
  for (const slot of Object.values(SLOT_REGISTRY)) {
    if (!modelsById[slot.modelId]) {
      throw new Error(
        `SLOT_REGISTRY references unknown model: ${slot.modelId} (slot: ${slot.slot}). ` +
          `Update packages/types/src/models.json or fix SLOT_REGISTRY.`,
      );
    }
  }
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

function normalizeProductTier(tier: string | null | undefined): ProductTier {
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

export function getProviderSurface(provider: Provider | string): ProviderSurface {
  const normalizedProvider = provider.toLowerCase();
  if (MANAGED_CLOUD_PROVIDER_SET.has(normalizedProvider)) {
    return 'managed_cloud';
  }
  if (BYOK_PROVIDER_SET.has(normalizedProvider)) {
    return 'byok';
  }
  if (LOCAL_PROVIDER_SET.has(normalizedProvider)) {
    return 'local';
  }
  return 'hidden';
}

export function getManagedCloudProviderIds(
  options: {
    includeSearchProviders?: boolean;
  } = {},
): Provider[] {
  const { includeSearchProviders = true } = options;
  return MANAGED_CLOUD_PROVIDER_IDS.filter(
    (provider) => includeSearchProviders || !SEARCH_ONLY_MANAGED_CLOUD_PROVIDER_SET.has(provider),
  ) as unknown as Provider[];
}

export function getTierPolicy(tier: string | null | undefined): TierPolicy {
  return TIER_POLICIES[normalizeProductTier(tier)];
}

export function canAccessManualModelSelection(tier: string | null | undefined): boolean {
  return getTierPolicy(tier).manualModelSelection;
}

export function getRoutingSlotDefinition(slot: RoutingSlot): RoutingSlotDefinition {
  return SLOT_REGISTRY[slot];
}

export function getRoutingSlotModel(slot: RoutingSlot): string {
  return getRoutingSlotDefinition(slot).modelId;
}

export function getManualOverrideModelIds(): string[] {
  return [...MANUAL_OVERRIDE_MODEL_IDS];
}

export function isManualOverrideModel(modelId: string | null | undefined): boolean {
  const canonicalModelId = normalizeModelId(modelId);
  return canonicalModelId ? MANUAL_OVERRIDE_MODEL_SET.has(canonicalModelId) : false;
}

export function getManualOverrideModels(
  options: { includeSearch?: boolean } = {},
): ModelMetadata[] {
  const { includeSearch = false } = options;
  return MANUAL_OVERRIDE_MODEL_IDS.map((modelId) => getModelMetadataById(modelId))
    .filter((model): model is ModelMetadata => Boolean(model))
    .filter((model) => includeSearch || model.modelType !== 'search');
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

function describeQualityBand(model: ModelMetadata): string {
  switch (model.qualityTier) {
    case 'best':
      return 'flagship reasoning';
    case 'balanced':
      return 'balanced all-rounder';
    case 'fast':
    default:
      return 'fast, efficient';
  }
}

function formatCoreModelDetail(model: ModelMetadata): string {
  const tierLabel: Record<PickerModelTier, string> = {
    economy: 'Economy',
    balanced: 'Balanced',
    premium: 'Premium',
  };
  const tier = tierLabel[getPickerModelTier(model.id)];
  const bestFor = model.bestFor.slice(0, 2).join(', ');
  return bestFor ? `${tier} · ${bestFor}` : tier;
}

export function getCoreManualModelOptions(): CoreModelOption[] {
  return getManualOverrideModels().map((model) => {
    const providerLabel = providerLabels[model.provider] ?? model.provider;
    return {
      id: model.id,
      label: model.name,
      provider: model.provider,
      providerLabel,
      description: `${providerLabel} — ${describeQualityBand(model)}`,
      detail: formatCoreModelDetail(model),
    };
  });
}

export function resolveAutoModeModel(
  autoMode: AutoModeModelId | string | null | undefined,
  subscriptionTier?: string | null,
): string | null {
  const normalizedMode = (autoMode ?? 'auto-balanced').toLowerCase() as AutoModeModelId;
  const normalizedTier = normalizeProductTier(subscriptionTier);

  if (!AUTO_MODE_IDS.has(normalizedMode)) {
    return normalizeModelId(normalizedMode);
  }

  if (
    (normalizedTier === 'free' || normalizedTier === 'hobby') &&
    (normalizedMode === 'auto-balanced' || normalizedMode === 'auto-premium')
  ) {
    return resolveAutoModeModel('auto-economy', subscriptionTier);
  }

  if (normalizedTier === 'pro' && normalizedMode === 'auto-premium') {
    return resolveAutoModeModel('auto-balanced', subscriptionTier);
  }

  switch (normalizedMode) {
    case 'auto':
    case 'auto-balanced':
      return getRoutingSlotModel('general_balanced');
    case 'auto-premium':
      return getRoutingSlotModel('general_premium');
    case 'auto-economy':
    default:
      return getRoutingSlotModel('general_fast');
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
