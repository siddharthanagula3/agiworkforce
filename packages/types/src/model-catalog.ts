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
import type { RoutingTaskType } from './runtime';
import type { SubscriptionTier } from './user';
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
export type ProductTier = 'free' | 'hobby' | 'pro' | 'pro_plus' | 'max' | 'enterprise';
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
  | 'voice_rewrite'
  // Auto-routing-spec §2 — Pool B Hobby slots
  | 'workhorse_general'
  | 'escalation_coding'
  // parallel-spinning-hedgehog §3 — Pro tier *_pro slots
  | 'general_balanced_pro'
  | 'coding_premium_pro'
  | 'reasoning_premium_pro'
  | 'multimodal_pro'
  | 'long_context_pro'
  // parallel-spinning-hedgehog §3 — Pro+ tier flagship slots (15K-tokens/day cap)
  | 'flagship_coding_pro_plus'
  | 'flagship_general_pro_plus'
  | 'video_generation_pro_plus';

export interface RoutingSlotDefinition {
  slot: RoutingSlot;
  label: string;
  description: string;
  modelId: string;
  provider: Provider | string;
}

/**
 * Cap-behavior thresholds for tiered usage limits.
 *
 * Per `tasks/auto-routing-spec.md` §1 (cap behavior locked decision):
 *   - `warnAt 0.8`     — surface `X-Quota-Warning` header / in-stream metadata.
 *   - `downgradeAt 1.0`— silent route swap to workhorse model.
 *   - `hardCapAt 1.5`  — refuse with paywall payload (HTTP 429).
 *
 * Frozen at module load (Vercel `server-no-shared-module-state`).
 */
export interface TierCapBehavior {
  /** Fraction of cap at which to surface a warning to the user. */
  warnAt: number;
  /** Fraction of cap at which to silently downgrade to a workhorse model. */
  downgradeAt: number;
  /** Fraction of cap at which to hard-block the request with a paywall. */
  hardCapAt: number;
}

/**
 * Canonical tier policy shape used for both routing decisions and quota
 * enforcement. Required fields are present on every tier; optional spec fields
 * (token caps, image quotas, tool-tier ladder) are populated only on tiers
 * that need them.
 *
 * See `tasks/auto-routing-spec.md` §1 + §6 and
 * `~/.claude/plans/parallel-spinning-hedgehog.md` §3-§6 for the canonical
 * tier matrix and capability gating ladder.
 *
 * Vercel rule applied: `server-no-shared-module-state` — every policy object
 * is deep-frozen at module load and never mutated.
 */
export interface TierPolicy {
  // ---- Always-required fields (shape-locked since Phase 0) ----
  tier: ProductTier;
  surfacedUx: TierSurfaceMode;
  allowedSlots: readonly RoutingSlot[];
  allowedProviderSurfaces: readonly ProviderSurface[];
  /** Legacy boolean flag for the manual-model picker (kept for backward compat). */
  manualModelSelection: boolean;
  allowBrowserDom: boolean;
  allowComputerUse: boolean;
  allowSearch: boolean;
  allowMediaGeneration: boolean;

  // ---- Phase-1 spec extensions (optional; not every tier uses them) ----

  /**
   * Aliased mirror of `manualModelSelection` per parallel-spinning-hedgehog §6
   * (Round 13 Advanced-mode toggle). Populated wherever `manualModelSelection`
   * is set so consumers can use either name.
   */
  allowManualSelection?: boolean;

  /** Per-tier monthly text-token budget. `null`/undefined = uncapped. */
  tokenCapPerMonth?: number | null;
  /** Per-tier daily message cap (Free tier only at v1). */
  messagesPerDayCap?: number | null;
  /** Threshold ladder used by `assertQuota` for cap evaluation. */
  capBehavior?: TierCapBehavior;

  /** Image generation gate — independent from `allowMediaGeneration` umbrella. */
  allowImageGeneration?: boolean;
  /** Video generation gate — Pro+/Max only at v1. */
  allowVideoGeneration?: boolean;
  /** Per-month image cap (`null` = uncapped, debits global token bucket). */
  imageQuotaPerMonth?: number | null;
  /** Synthetic token cost charged against `tokenCapPerMonth` per generated image. */
  imageSyntheticTokenCost?: number;

  /**
   * Tool-use tier ladder (Round 16). Either a boolean (Free=false, lower tiers)
   * or a string label denoting the burn-warning policy
   * (e.g. `'web_search_with_burn_warning'`, `'unlimited'`).
   */
  allowToolUse?: boolean | string;
  /** MCP tier ladder (Round 16) — same shape as `allowToolUse`. */
  allowMCP?: boolean | string;

  // ---- Phase-3 (Pro+) spec extensions ----

  /**
   * Per-day token cap for flagship slots (Opus 4.7, GPT-5.5) on Pro+.
   * Above this cap, flagship requests fall through to non-flagship Pro slots.
   * Enforced by `assertQuota` daily-cap check using
   * `token_credits.daily_used_cents` (already provisioned by billing schema).
   * Pro+ default: 15_000 per spec §3 / §6.
   */
  flagshipDailyTokenCap?: number;

  /**
   * Per-month video generation budget in seconds. Pro+: 60s. Max: 300s.
   * Above the cap, video gen returns paywall (or upgrade prompt for Pro+ → Max).
   */
  videoSecondsPerMonth?: number;

  /**
   * Whether the surface should expose the "US-only routing" toggle in settings.
   * Pro+/Max users may opt in to skip Chinese vendors (DeepSeek/Kimi/Zhipu/
   * MiniMax/Doubao). The toggle is a per-account preference; this flag only
   * controls whether the UI renders it. Spec §11 Round 14 + Round 15.
   */
  usOnlyRoutingAvailable?: boolean;

  // ---- Phase-4 (Max) spec extensions ----

  /**
   * Soft monthly cap for computer-use actions. At this point we surface a
   * usage warning but continue serving requests. Max tier: 1_000.
   */
  computerUseSoftCap?: number;
  /**
   * Hard monthly cap for computer-use actions. Above this point assertQuota
   * returns a paywall outcome. Max tier: 2_500.
   */
  computerUseHardCap?: number;

  /**
   * Whether the tier exposes the "Deep research" agentic mode (long-form
   * web search + summarization workflow). Max-only at v1.
   */
  allowDeepResearch?: boolean;

  /**
   * Whether the tier exposes Wispr-Flow-style system-wide voice dictation:
   * push-to-talk hotkey → Whisper transcription → optional AI cleanup → paste
   * at cursor in any text field (system-wide). Hobby+ at v1 (Round 15-launch
   * decision 2026-05-15 supersedes Round 14 "voice deferred"). BYOK users
   * bring their own Whisper API key — no markup on our side.
   */
  allowVoice?: boolean;
  /**
   * Per-month voice transcription minutes budget. `null`/undefined = uncapped.
   * Hobby: 60 min. Pro: 300. Pro+: 1500. Max+Enterprise: uncapped.
   */
  voiceMinutesPerMonth?: number | null;
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
    label: 'Reasoning Premium (Hobby)',
    description:
      'Hobby pool reasoning lane (Pool B, plan §4). DeepSeek V4 Flash thinking: $0.14/$0.28, $0.0028 cache hit, 1M context. Pro tier uses reasoning_premium_pro (Kimi K2.6).',
    modelId: 'deepseek-v4-flash',
    provider: 'deepseek',
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
    description:
      'Pool B image gen lane (plan §4). Imagen 4 Fast: $0.02/image at 1024x1024 via Vertex AI. Half the cost of Imagen 4 standard ($0.04) — keeps Hobby image-quota economics tight.',
    modelId: 'imagen-4-fast',
    provider: 'google',
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

  // ---------------------------------------------------------------------------
  // POOL B HOBBY SLOTS (auto-routing-spec §2 — frozen 2026-05-07).
  // Workhorse 80% / Escalation 12% / Reasoning 8% covers the Hobby
  // 2M-token bucket at ~$1.10 worst-case with caching. Image generation
  // shares the `image_generation` slot above (10/mo cap on Hobby).
  // ---------------------------------------------------------------------------
  workhorse_general: {
    slot: 'workhorse_general',
    label: 'Workhorse General',
    description:
      'Pool B workhorse (80% of Hobby traffic). Gemini 3.1 Flash-Lite: 327 tok/s, $0.25/$1.50, 1M context, multimodal-native.',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'google',
  },
  escalation_coding: {
    slot: 'escalation_coding',
    label: 'Escalation Coding',
    description:
      'Pool B escalation lane (12% — coding + complex). GLM-4.7: $0.30/$1.20, 256K context.',
    modelId: 'glm-4.7',
    provider: 'zhipu',
  },

  // ---------------------------------------------------------------------------
  // PRO TIER *_pro SLOTS (parallel-spinning-hedgehog §3-§4).
  // Pro pool: Sonnet 4.6 + Gemini 3.1 Pro + GPT-5.4-mini + Kimi K2.6.
  // Hobby slots (workhorse_general / escalation_coding / reasoning_premium)
  // remain reachable from Pro for 100% downgrade fallback paths.
  // ---------------------------------------------------------------------------
  general_balanced_pro: {
    slot: 'general_balanced_pro',
    label: 'Pro General Balanced',
    description:
      'Pro balanced lane. GPT-5.4-mini: $0.75/$4.50, fast TTFT, balanced quality for general chat + creative writing.',
    modelId: 'gpt-5.4-mini',
    provider: 'openai',
  },
  coding_premium_pro: {
    slot: 'coding_premium_pro',
    label: 'Pro Coding Premium',
    description:
      'Pro coding lane. Claude Sonnet 4.6: $3/$15, top-tier Aider Polyglot + SWE-bench Verified.',
    modelId: 'claude-sonnet-4.6',
    provider: 'anthropic',
  },
  reasoning_premium_pro: {
    slot: 'reasoning_premium_pro',
    label: 'Pro Reasoning Premium',
    description:
      'Pro reasoning lane. Kimi K2.6: $0.95/$4.00, Round 14 V4-Pro replacement (DeepSeek V4-Pro promo expires 2026-05-31).',
    modelId: 'kimi-k2.6',
    provider: 'moonshot',
  },
  multimodal_pro: {
    slot: 'multimodal_pro',
    label: 'Pro Multimodal',
    description:
      'Pro multimodal + vision lane. Gemini 3.1 Pro: $2/$12 (≤200K), FACTS Grounding #1, holds 500K-1M tokens cleanly.',
    modelId: 'gemini-3.1-pro-preview',
    provider: 'google',
  },
  long_context_pro: {
    slot: 'long_context_pro',
    label: 'Pro Long Context',
    description:
      'Pro long-context lane (>50K cumulative tokens). Gemini 3.1 Pro: 1M context window, best long-doc retrieval.',
    modelId: 'gemini-3.1-pro-preview',
    provider: 'google',
  },
  // Pro+ tier flagship slots — 15K tokens/day cap each (enforced via
  // assertQuota daily-cap check). Above the cap, requests fall through
  // to coding_premium_pro / general_balanced_pro respectively.
  flagship_coding_pro_plus: {
    slot: 'flagship_coding_pro_plus',
    label: 'Pro+ Flagship Coding (Opus 4.7, 15K/day)',
    description:
      'Pro+ flagship coding lane. Claude Opus 4.7: 87.6% SWE-bench Verified, $5/$25 (35% tokenizer inflation vs 4.6). Daily cap 15K tokens; falls through to coding_premium_pro (Sonnet 4.6) above cap.',
    modelId: 'claude-opus-4.7',
    provider: 'anthropic',
  },
  flagship_general_pro_plus: {
    slot: 'flagship_general_pro_plus',
    label: 'Pro+ Flagship General (GPT-5.5, 15K/day)',
    description:
      'Pro+ flagship general/agentic lane. GPT-5.5: $5/$30, top Terminal-Bench/MCP-Atlas. Daily cap 15K tokens; falls through to general_balanced_pro (GPT-5.4 mini) above cap.',
    modelId: 'gpt-5.5',
    provider: 'openai',
  },
  video_generation_pro_plus: {
    slot: 'video_generation_pro_plus',
    label: 'Pro+ Video Generation',
    description:
      'Pro+ video lane. Runway Gen-4 at 720p — 60 sec/mo cap (~$3 COGS budget). Falls through to paywall above cap.',
    modelId: 'runway-gen-4',
    provider: 'runway',
  },
};

// ---------------------------------------------------------------------------
// Tier policies — auto-routing-spec §1 + parallel-spinning-hedgehog §3.
//
// Standard cap behavior (every paid tier, locked Round 4):
//   warn at 80% → silent downgrade at 100% → hard cap at 150%.
// `STANDARD_CAP_BEHAVIOR` is shared by every tier that has a token budget so
// the constant is referenced (not copied) — Object.freeze keeps callers from
// mutating it, and the registry-level deep-freeze below covers the parent.
// ---------------------------------------------------------------------------
const STANDARD_CAP_BEHAVIOR: TierCapBehavior = Object.freeze({
  warnAt: 0.8,
  downgradeAt: 1.0,
  hardCapAt: 1.5,
});

/**
 * Internal mutable definition of the tier-policy registry. The deep-freeze
 * pass below converts every nested array + object to immutable form, then we
 * re-export the same reference as `TIER_POLICIES` (the canonical public name)
 * and `TIER_POLICIES_INTERNAL` (the spec name used by tests + assert-quota).
 *
 * Keeping the registry in a single source means consumers cannot accidentally
 * spawn divergent copies — Vercel `server-no-shared-module-state` is satisfied
 * because each tier object is frozen at module load and never mutated.
 */
const TIER_POLICIES_DEFINITION: Record<ProductTier, TierPolicy> = {
  free: {
    tier: 'free',
    surfacedUx: 'auto_only',
    // Free tier exposes only the Pool B workhorse — no escalation/reasoning/image.
    allowedSlots: ['workhorse_general'],
    allowedProviderSurfaces: ['managed_cloud'],
    manualModelSelection: false,
    allowManualSelection: false,
    allowBrowserDom: false,
    allowComputerUse: false,
    allowSearch: false,
    allowMediaGeneration: false,
    allowImageGeneration: false,
    allowVideoGeneration: false,
    allowToolUse: false,
    allowMCP: false,
    tokenCapPerMonth: 100_000,
    messagesPerDayCap: 5,
    capBehavior: STANDARD_CAP_BEHAVIOR,
  },
  hobby: {
    tier: 'hobby',
    surfacedUx: 'auto_only',
    // Pool B: workhorse_general 80% + escalation_coding 12% + reasoning_premium 8%
    // + image_generation (10/mo cap, 50K-token synthetic charge per image).
    allowedSlots: [
      'workhorse_general',
      'escalation_coding',
      'reasoning_premium',
      'image_generation',
      // Round 15-launch (2026-05-15) — voice slots reopened for Wispr-Flow
      // style system-wide dictation. Hobby+ at v1.
      'voice_transcription',
      'voice_rewrite',
    ],
    allowedProviderSurfaces: ['managed_cloud'],
    manualModelSelection: false,
    allowManualSelection: false,
    allowBrowserDom: false,
    allowComputerUse: false,
    allowSearch: true,
    allowMediaGeneration: true,
    allowImageGeneration: true,
    allowVideoGeneration: false,
    imageQuotaPerMonth: 10,
    imageSyntheticTokenCost: 50_000,
    // Hobby voice budget: 60 min/mo (Wispr-Flow positioning).
    allowVoice: true,
    voiceMinutesPerMonth: 60,
    // Round 16 tool-tier ladder — Hobby gets web search + basic MCP with
    // burn-warning UX (in-stream metadata) so users notice quota burn.
    allowToolUse: 'web_search_with_burn_warning',
    allowMCP: 'basic_with_burn_warning',
    tokenCapPerMonth: 2_000_000,
    capBehavior: STANDARD_CAP_BEHAVIOR,
  },
  pro: {
    tier: 'pro',
    // Pro surfaces both Auto and the Advanced-mode manual picker per
    // parallel-spinning-hedgehog §6 (Round 13 Advanced-mode toggle).
    surfacedUx: 'auto_plus_manual',
    // Pool B workhorse for downgrade fallback + Pro-tier *_pro slots +
    // image_generation (no per-image cap; debits 10M-token bucket).
    // Browser/computer use + search lanes light-touch enabled.
    allowedSlots: [
      'workhorse_general',
      'general_balanced_pro',
      'coding_premium_pro',
      'reasoning_premium_pro',
      'multimodal_pro',
      'long_context_pro',
      'image_generation',
      'browser_dom',
      'computer_use',
      'search_fast',
      'search_premium',
      // Round 15-launch voice unlock (Pro: 300 min/mo).
      'voice_transcription',
      'voice_rewrite',
    ],
    allowedProviderSurfaces: ['managed_cloud', 'byok'],
    // CRITICAL Pro unlock — the manual picker is the entire reason users pay
    // for Pro. Both names must be true so consumers using either field name
    // see the unlock (legacy `manualModelSelection` + canonical
    // `allowManualSelection`).
    manualModelSelection: true,
    allowManualSelection: true,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: true,
    allowImageGeneration: true,
    // Pro voice budget: 300 min/mo.
    allowVoice: true,
    voiceMinutesPerMonth: 300,
    // Video gen is a Pro+ unlock per spec §6.
    allowVideoGeneration: false,
    // null = no per-image cap; image generation debits the 10M-token bucket
    // via imageSyntheticTokenCost.
    imageQuotaPerMonth: null,
    imageSyntheticTokenCost: 50_000,
    // Round 16 — Pro elevates tools + MCP to unlimited.
    allowToolUse: 'unlimited',
    allowMCP: 'unlimited',
    tokenCapPerMonth: 10_000_000,
    capBehavior: STANDARD_CAP_BEHAVIOR,
  },
  pro_plus: {
    tier: 'pro_plus',
    // Pro+ surfaces both Auto and the Advanced-mode manual picker (same as Pro).
    surfacedUx: 'auto_plus_manual',
    // Pro+ pool = Pro pool + flagship_coding_pro_plus (Opus 4.7) +
    // flagship_general_pro_plus (GPT-5.5) + video_generation_pro_plus (Runway Gen-4).
    // The flagship slots are gated by per-day token caps (15K/day each)
    // enforced by assertQuota; above-cap requests fall through to Pro slots.
    allowedSlots: [
      'workhorse_general',
      'general_balanced_pro',
      'coding_premium_pro',
      'reasoning_premium_pro',
      'multimodal_pro',
      'long_context_pro',
      'flagship_coding_pro_plus',
      'flagship_general_pro_plus',
      'video_generation_pro_plus',
      'image_generation',
      'browser_dom',
      'computer_use',
      'computer_use_premium',
      'search_fast',
      'search_premium',
      // Round 15-launch voice unlock (Pro+: 1500 min/mo).
      'voice_transcription',
      'voice_rewrite',
    ],
    allowedProviderSurfaces: ['managed_cloud', 'byok'],
    manualModelSelection: true,
    allowManualSelection: true,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: true,
    allowImageGeneration: true,
    // Pro+ unlocks video gen (60 sec/mo cap; Runway Gen-4 at 720p).
    allowVideoGeneration: true,
    imageQuotaPerMonth: null,
    imageSyntheticTokenCost: 50_000,
    // Pro+ voice budget: 1500 min/mo (25 hours).
    allowVoice: true,
    voiceMinutesPerMonth: 1500,
    // Pro+ unlocks Opus 4.7 + GPT-5.5 with daily-token caps. The numbers
    // here are the canonical caps from auto-routing-spec §3 + §6.
    flagshipDailyTokenCap: 15_000,
    videoSecondsPerMonth: 60,
    // Pro+ surfaces the US-only routing settings toggle (Round 14 / 15).
    usOnlyRoutingAvailable: true,
    allowToolUse: 'unlimited',
    allowMCP: 'unlimited',
    tokenCapPerMonth: 10_000_000,
    capBehavior: STANDARD_CAP_BEHAVIOR,
  },
  max: {
    tier: 'max',
    surfacedUx: 'auto_plus_manual',
    allowedSlots: [
      'workhorse_general',
      'general_balanced_pro',
      'coding_premium_pro',
      'reasoning_premium_pro',
      'multimodal_pro',
      'long_context_pro',
      // Pro+ flagship slots — Max gets these too with its own larger monthly
      // cap (1M tokens/mo per flagship) enforced by assertQuota. Without
      // these, Max users routing through TASK_TYPE_TO_SLOT_PRO_PLUS would
      // fall back to workhorse_general.
      'flagship_coding_pro_plus',
      'flagship_general_pro_plus',
      'video_generation_pro_plus',
      'general_premium',
      'creative_writing',
      'creative_writing_premium',
      'search_fast',
      'search_premium',
      'vision_premium',
      'browser_dom',
      'computer_use',
      'computer_use_premium',
      'image_generation',
      'video_generation',
      // Round 15-launch voice unlock (Max: unlimited).
      'voice_transcription',
      'voice_rewrite',
    ],
    allowedProviderSurfaces: ['managed_cloud', 'byok', 'local'],
    manualModelSelection: true,
    allowManualSelection: true,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: true,
    allowImageGeneration: true,
    allowVideoGeneration: true,
    imageQuotaPerMonth: null,
    imageSyntheticTokenCost: 50_000,
    // Max voice budget: unlimited.
    allowVoice: true,
    voiceMinutesPerMonth: null,
    // Max also surfaces the US-only routing toggle (inherits Pro+ capability).
    usOnlyRoutingAvailable: true,
    // Max-tier video budget: 5 min/mo at 720p (Runway Gen-4). Spec §3 + §12.
    videoSecondsPerMonth: 300,
    // Max computer-use ladder: warn at 1K actions, paywall at 2.5K. Spec §3.
    computerUseSoftCap: 1_000,
    computerUseHardCap: 2_500,
    // Max enables Deep Research workflows.
    allowDeepResearch: true,
    allowToolUse: 'unlimited',
    allowMCP: 'unlimited',
    tokenCapPerMonth: 50_000_000,
    capBehavior: STANDARD_CAP_BEHAVIOR,
  },
  enterprise: {
    tier: 'enterprise',
    surfacedUx: 'auto_plus_manual',
    allowedSlots: [
      'workhorse_general',
      'general_balanced_pro',
      'coding_premium_pro',
      'reasoning_premium_pro',
      'multimodal_pro',
      'long_context_pro',
      'flagship_coding_pro_plus',
      'flagship_general_pro_plus',
      'video_generation_pro_plus',
      'general_premium',
      'creative_writing',
      'creative_writing_premium',
      'search_fast',
      'search_premium',
      'vision_premium',
      'browser_dom',
      'computer_use',
      'computer_use_premium',
      'image_generation',
      'video_generation',
      // Round 15-launch voice unlock (Enterprise: unlimited).
      'voice_transcription',
      'voice_rewrite',
    ],
    allowedProviderSurfaces: ['managed_cloud', 'byok', 'local'],
    manualModelSelection: true,
    allowManualSelection: true,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: true,
    allowImageGeneration: true,
    allowVideoGeneration: true,
    imageQuotaPerMonth: null,
    imageSyntheticTokenCost: 50_000,
    // Enterprise voice: unlimited.
    allowVoice: true,
    voiceMinutesPerMonth: null,
    allowToolUse: 'unlimited',
    allowMCP: 'unlimited',
    // Enterprise is uncapped at the policy level (custom contracts handle billing).
    tokenCapPerMonth: null,
    capBehavior: STANDARD_CAP_BEHAVIOR,
  },
};

/**
 * Deep-freeze a tier policy so concurrent renders + accidental writes raise
 * a TypeError rather than silently corrupting shared state. Frozen recursively
 * across `allowedSlots`, `allowedProviderSurfaces`, and `capBehavior`.
 */
function deepFreezeTierPolicy(policy: TierPolicy): TierPolicy {
  Object.freeze(policy.allowedSlots);
  Object.freeze(policy.allowedProviderSurfaces);
  if (policy.capBehavior) {
    Object.freeze(policy.capBehavior);
  }
  return Object.freeze(policy);
}

for (const tier of Object.keys(TIER_POLICIES_DEFINITION) as ProductTier[]) {
  deepFreezeTierPolicy(TIER_POLICIES_DEFINITION[tier]);
}
Object.freeze(TIER_POLICIES_DEFINITION);

/**
 * Canonical tier-policy registry. Frozen at module load. Consumers SHOULD use
 * `getTierPolicy(tier)` instead of indexing this directly so the
 * normalize-tier-string layer is applied.
 */
export const TIER_POLICIES = TIER_POLICIES_DEFINITION;

/**
 * Spec-aligned alias for tests + `apps/web/lib/assert-quota.ts` (see
 * `~/.claude/plans/parallel-spinning-hedgehog.md` §7 — the spec calls this
 * registry `TIER_POLICIES_INTERNAL`). Same reference; do not mutate.
 */
export const TIER_POLICIES_INTERNAL = TIER_POLICIES_DEFINITION;

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
  const entries: Record<string, ModelMetadata> = {};

  // Direct model entries from models.json. These are canonical for non-
  // deprecated models — MUST NOT be overridden by aliases — an alias is
  // a fallback for legacy IDs, not a redirect for live IDs.
  // Pre-existing gotcha: deepseek-chat had both a direct entry and an
  // alias pointing at deepseek-v4-flash; the alias was overwriting the
  // canonical entry, flipping its `vision` capability.
  for (const [modelId, metadata] of Object.entries(modelsCatalog.models)) {
    entries[modelId] = metadata;
  }

  // Aliases redirect deprecated/legacy model IDs forward to the current
  // canonical entry. We only let an alias replace an existing entry if
  // the existing entry is marked `deprecated: true` — that signals
  // "yes, redirect this to the live model"; otherwise the entry wins.
  for (const [alias, canonicalModelId] of Object.entries(modelIdAliases)) {
    const target = modelsCatalog.models[canonicalModelId];
    if (!target) continue;
    const existing = entries[alias];
    if (existing && !existing.deprecated) {
      // Live entry — keep it, don't let the alias shadow real metadata.
      continue;
    }
    entries[alias] = target;
  }

  return entries;
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
    case 'pro_plus':
    case 'pro+':
      return 'pro_plus';
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

/**
 * Reverse index: modelId → first matching slot. Built once at module load so
 * `getSlotForModel` is O(1) instead of O(N) per call (Vercel rule
 * `js-set-map-lookups`). Declaration order in `SLOT_REGISTRY_INTERNAL` is
 * preserved by `Object.entries` on insertion-ordered objects, so when the
 * same modelId backs multiple slots (e.g. workhorse + multimodal both on
 * Flash) the FIRST declared slot wins, matching the previous linear-scan
 * semantics.
 */
const MODEL_TO_FIRST_SLOT: ReadonlyMap<string, RoutingSlot> = (() => {
  const m = new Map<string, RoutingSlot>();
  for (const [slotKey, def] of Object.entries(SLOT_REGISTRY)) {
    if (!m.has(def.modelId)) {
      m.set(def.modelId, slotKey as RoutingSlot);
    }
  }
  return m;
})();

/**
 * Reverse lookup: find the routing slot whose SLOT_REGISTRY entry points at
 * the given modelId. Used by the route handler to derive a slot from a
 * resolved model so it can be passed to assertQuota for daily-cap gating.
 *
 * Returns the FIRST declared matching slot. If the same model is reused
 * across slots, the first match wins (per `MODEL_TO_FIRST_SLOT`). Callers
 * that need a specific slot should resolve it explicitly via
 * `TASK_TYPE_TO_SLOT_*` maps instead.
 */
export function getSlotForModel(modelId: string | null | undefined): RoutingSlot | null {
  if (!modelId) return null;
  const canonical = normalizeModelId(modelId) ?? modelId;
  return MODEL_TO_FIRST_SLOT.get(canonical) ?? null;
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

// Task-type → slot mapping for Free + Hobby tiers.
// Hobby pool (workhorse_general / escalation_coding / reasoning_premium / image_generation).
// Free tier only has workhorse_general; everything else falls through to that
// in the gating step below.
const TASK_TYPE_TO_SLOT: ReadonlyMap<RoutingTaskType, RoutingSlot> = Object.freeze(
  new Map<RoutingTaskType, RoutingSlot>([
    ['coding', 'escalation_coding'],
    ['reasoning', 'reasoning_premium'],
    ['image_generation', 'image_generation'],
    ['multimodal', 'workhorse_general'],
    ['long_context', 'workhorse_general'],
    ['simple_chat', 'workhorse_general'],
    ['general', 'workhorse_general'],
    ['creative_writing', 'workhorse_general'],
    ['research', 'workhorse_general'],
    ['agentic', 'workhorse_general'],
    ['computer-use', 'workhorse_general'],
  ]),
);

// Task-type → slot mapping for Pro / Pro+ / Max / Enterprise tiers.
// Pro pool (general_balanced_pro / coding_premium_pro / reasoning_premium_pro /
// multimodal_pro / long_context_pro / image_generation / computer_use).
const TASK_TYPE_TO_SLOT_PRO: ReadonlyMap<RoutingTaskType, RoutingSlot> = Object.freeze(
  new Map<RoutingTaskType, RoutingSlot>([
    ['coding', 'coding_premium_pro'],
    ['reasoning', 'reasoning_premium_pro'],
    ['image_generation', 'image_generation'],
    ['multimodal', 'multimodal_pro'],
    ['long_context', 'long_context_pro'],
    ['simple_chat', 'general_balanced_pro'],
    ['general', 'general_balanced_pro'],
    ['creative_writing', 'general_balanced_pro'],
    ['research', 'general_balanced_pro'],
    ['agentic', 'general_balanced_pro'],
    ['computer-use', 'computer_use'],
  ]),
);

// Pro+ pool — same as Pro for most tasks, but `coding` routes to flagship
// (Opus 4.7) and `general`/`agentic`/`research` route to flagship (GPT-5.5).
// The flagship slots are gated by `flagshipDailyTokenCap` (15K/day) enforced
// in `assertQuota`. Above-cap requests fall through to the Pro slot via the
// usual allowedSlots check.
const TASK_TYPE_TO_SLOT_PRO_PLUS: ReadonlyMap<RoutingTaskType, RoutingSlot> = Object.freeze(
  new Map<RoutingTaskType, RoutingSlot>([
    ['coding', 'flagship_coding_pro_plus'], // Opus 4.7 (15K/day)
    ['reasoning', 'reasoning_premium_pro'], // Kimi K2.6 (Pro slot — Opus tokens are precious)
    ['image_generation', 'image_generation'],
    ['multimodal', 'multimodal_pro'],
    ['long_context', 'long_context_pro'],
    ['simple_chat', 'general_balanced_pro'], // Don't burn flagship on small talk
    ['general', 'flagship_general_pro_plus'], // GPT-5.5 (15K/day)
    ['creative_writing', 'general_balanced_pro'],
    ['research', 'flagship_general_pro_plus'], // GPT-5.5 best for browse/research
    ['agentic', 'flagship_general_pro_plus'], // GPT-5.5 #1 Terminal-Bench/MCP-Atlas
    ['computer-use', 'computer_use_premium'], // Pro+ unlocks the premium CU slot
  ]),
);

// Selects the right task-type-to-slot map per tier. Free + Hobby use the
// Hobby pool; Pro shares the Pro map; Pro+ uses Pro+ map with flagship
// routing for coding/general/agentic/research; Max/Enterprise share the
// Pro+ map (they get flagship access too, just with bigger monthly caps).
function pickTaskTypeMapForTier(tier: ProductTier): ReadonlyMap<RoutingTaskType, RoutingSlot> {
  if (tier === 'pro_plus' || tier === 'max' || tier === 'enterprise') {
    return TASK_TYPE_TO_SLOT_PRO_PLUS;
  }
  if (tier === 'pro') {
    return TASK_TYPE_TO_SLOT_PRO;
  }
  return TASK_TYPE_TO_SLOT;
}

/**
 * Set of provider identifiers that the US-only routing toggle excludes.
 * Spec §11 Round 14/15. Frozen at module load.
 */
export const NON_US_PROVIDERS: ReadonlySet<string> = Object.freeze(
  new Set<string>(['deepseek', 'qwen', 'moonshot', 'zhipu', 'minimax']),
);

/**
 * True when the model behind a slot is from a provider the US-only toggle
 * keeps (i.e. NOT in NON_US_PROVIDERS).
 */
function slotIsUsRouting(slot: RoutingSlot): boolean {
  const def = SLOT_REGISTRY[slot];
  if (!def) return false;
  return !NON_US_PROVIDERS.has(def.provider);
}

/**
 * Optional resolver hints — Pro+ "US-only routing" is the only one in v1.
 * Future fields (geo overlays, no-thinking, etc.) plug in here.
 */
export interface ResolveAutoModeOptions {
  /**
   * When true, skip non-US providers (DeepSeek/Kimi/Zhipu/MiniMax/Qwen)
   * and pick the first US/EU-friendly slot in the tier's allowedSlots that
   * still satisfies the requested task type. Pro+/Max-only setting per
   * spec §11 Round 14.
   */
  usOnly?: boolean;
}

export function resolveAutoModeModel(
  autoMode: AutoModeModelId | string | null | undefined,
  subscriptionTier?: string | null,
  taskType?: RoutingTaskType,
  options?: ResolveAutoModeOptions,
): string | null {
  const normalizedMode = (autoMode ?? 'auto-balanced').toLowerCase() as AutoModeModelId;
  const normalizedTier = normalizeProductTier(subscriptionTier);
  const usOnly = options?.usOnly === true;

  // Task-aware path (new): when caller provides taskType from the classifier,
  // map task → tier-appropriate slot → modelId. Slots not in the tier's
  // allowedSlots fall back to workhorse_general (which every tier has, even Free).
  if (taskType !== undefined) {
    const policy = getTierPolicy(normalizedTier);
    const taskMap = pickTaskTypeMapForTier(normalizedTier);
    const desiredSlot = taskMap.get(taskType);
    if (desiredSlot === undefined) {
      return null;
    }
    let chosenSlot: RoutingSlot = policy.allowedSlots.includes(desiredSlot)
      ? desiredSlot
      : 'workhorse_general';

    // US-only override: if the desired slot points at a non-US model, walk
    // the tier's allowedSlots in declaration order to find the first slot
    // that (a) handles this task and (b) maps to a US/EU provider. If no
    // candidate qualifies, fall back to workhorse_general (Gemini Flash —
    // always US-routed by Vertex). Only honored when the tier policy
    // declares the toggle is available; lower tiers ignore the flag.
    if (usOnly && policy.usOnlyRoutingAvailable && !slotIsUsRouting(chosenSlot)) {
      const fallbackSlot = policy.allowedSlots.find((s) => s !== chosenSlot && slotIsUsRouting(s));
      chosenSlot = fallbackSlot ?? 'workhorse_general';
    }

    return getRoutingSlotModel(chosenSlot);
  }

  // Legacy auto-mode path (backward compat for callers that don't pass taskType).
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

/**
 * Kinds of "default model" requests `getDefaultModelFor` understands.
 *
 * Each kind maps to a tier-aware `RoutingSlot` lookup using the same
 * `TIER_POLICIES` registry the auto-router consults. Use this helper instead
 * of hardcoding model IDs (`'gpt-5.4-mini'`, `'claude-haiku-4.5'`, etc.) at
 * call sites — those literals trip the no-hardcoded-model-ids ESLint rule.
 *
 * @see resolveAutoModeModel for the legacy auto-mode picker.
 */
export type DefaultModelKind = 'chat' | 'fast-status' | 'voice' | 'computer-use' | 'reasoning';

/**
 * Ordered slot preference per `DefaultModelKind`. The helper walks this list
 * in order, picking the first slot the tier's policy actually exposes; a
 * final `workhorse_general` fallback ensures every tier (including Free)
 * resolves to a real model.
 *
 * Tied to `SLOT_REGISTRY` + `TIER_POLICIES` in this file — both are the SSOT.
 */
const DEFAULT_KIND_SLOT_PREFERENCE: Record<DefaultModelKind, readonly RoutingSlot[]> =
  Object.freeze({
    chat: Object.freeze(['general_balanced_pro', 'general_balanced', 'workhorse_general'] as const),
    'fast-status': Object.freeze(['general_fast', 'workhorse_general'] as const),
    voice: Object.freeze(['voice_transcription'] as const),
    'computer-use': Object.freeze([
      'computer_use_premium',
      'computer_use',
      'workhorse_general',
    ] as const),
    reasoning: Object.freeze([
      'reasoning_premium_pro',
      'reasoning_premium',
      'workhorse_general',
    ] as const),
  });

/**
 * Returns the canonical default model ID for a given subscription tier and
 * "kind" of usage (chat, fast-status, voice, computer-use, reasoning).
 *
 * Lookup walks `DEFAULT_KIND_SLOT_PREFERENCE[kind]` and returns the first
 * slot present in the tier's `allowedSlots`. If no preferred slot is
 * allowed, falls back to `workhorse_general` (which every tier exposes,
 * including Free). The final `getRoutingSlotModel` call dereferences the
 * slot to a model ID via `SLOT_REGISTRY`, so the returned string always
 * reflects the catalog (`models.json`) — never a hardcoded literal.
 *
 * Use this from any surface (route handler, CLI fast-status header, voice
 * pipeline, computer-use orchestrator) that needs a tier-appropriate
 * default WITHOUT calling the full task-aware auto-router.
 *
 * Complementary to `resolveAutoModeModel` (line 1593+), which serves the
 * legacy `auto-economy/balanced/premium` picker plus the task-classified
 * routing path.
 */
export function getDefaultModelFor(
  tier: SubscriptionTier | ProductTier | string | null | undefined,
  kind: DefaultModelKind,
): string {
  const normalizedTier = normalizeProductTier(tier);
  const policy = getTierPolicy(normalizedTier);
  const preference = DEFAULT_KIND_SLOT_PREFERENCE[kind];
  const allowed = policy.allowedSlots;

  for (const candidate of preference) {
    if (allowed.includes(candidate)) {
      return getRoutingSlotModel(candidate);
    }
  }

  // Final safety net — every tier in TIER_POLICIES allows workhorse_general,
  // so this branch is dead code today. Kept defensive in case a future tier
  // policy elides the slot; better to return a real model than throw.
  return getRoutingSlotModel('workhorse_general');
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
