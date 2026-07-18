/**
 * Shared model catalog types for the AGI Workforce platform.
 *
 * These types define the compatibility shape for model metadata, provider
 * configuration, and capability representation. The canonical source lives in
 * `packages/ai/model-registry/catalog`; its compiler emits
 * `packages/contracts/types/src/models.json`, re-exported as `modelsCatalogJson` from this
 * package and embedded in Rust via `include_str!`.
 *
 * All surfaces should use these types when referencing model metadata.
 *
 * Compatibility interface: this file (types) + generated ./models.json (data).
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
import { modelRegistry } from '@agiworkforce/model-registry';
import type { Provider } from './provider';
import type { ModelInfo } from './provider-adapter';
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
  /**
   * Whether this model supports prompt caching (any form: explicit breakpoints
   * for Anthropic, automatic prefix caching for OpenAI/DeepSeek, or implicit
   * context caching for Gemini 2.5+/3.x). Set to true only on models where
   * cache-read discounts are confirmed available from official provider docs.
   */
  caching?: boolean;
}

/** Model type categories. */
export type ModelType =
  | 'chat'
  | 'code'
  | 'reasoning'
  | 'multimodal'
  | 'embedding'
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

/**
 * Per-model reasoning/effort control type. Sourced from
 * docs/research/reasoning-effort-capability-matrix-2026-07-10.md. Drives BOTH the
 * effort-flyout UI (what control to render) and the request path (which param to
 * send). Absent `reasoning` block ⇒ treated as `none`.
 *   - none            → not a reasoning model; hide effort UI entirely.
 *   - always_on       → reasoner-only; cannot disable. Show levels if any, no off.
 *   - thinking_toggle → boolean on/off (enable_thinking / thinking:{type}).
 *   - thinking_budget → token budget (min/max/default).
 *   - effort_levels   → discrete named levels; per-model allowed set.
 */
export type ReasoningControl =
  | 'none'
  | 'always_on'
  | 'thinking_toggle'
  | 'thinking_budget'
  | 'effort_levels';

/** Where in the provider request the reasoning params go (per API generation). */
export interface ReasoningRequestPaths {
  /** chat | responses | messages | gen. */
  api: 'chat' | 'responses' | 'messages' | 'gen';
  /** Path for the effort level string (e.g. reasoning_effort, output_config.effort). */
  effortPath?: string | null;
  /** Responses-API effort path when it differs from the chat path (GPT-5.6). */
  responsesEffortPath?: string | null;
  /** Path for the on/off toggle (e.g. enable_thinking, thinking.type). */
  togglePath?: string | null;
  /** Path for the token budget (e.g. thinking.budget_tokens, thinkingConfig.thinkingBudget). */
  budgetPath?: string | null;
}

/** Token-budget bounds for `thinking_budget` control models. */
export interface ReasoningBudget {
  min: number;
  max: number;
  default: number;
}

/**
 * GPT-5.6 Ultra (multi-agent) surface. RESPONSES-API-ONLY, beta-gated. Inert until
 * the model flips to availability:"live" AND a Responses request path is added.
 */
export interface ReasoningUltraMode {
  enabled: boolean;
  param: string;
  concurrencyParam?: string;
  beta?: string;
  endpoint: 'responses';
  responseItems?: string[];
}

/** Additive per-model reasoning capability metadata. Absent ⇒ non-reasoning. */
export interface ModelReasoning {
  /** false ⇒ hide effort UI entirely. */
  capable: boolean;
  control: ReasoningControl;
  /** effort_levels / always_on-with-levels: the model's ALLOWED effort set only. */
  supportedEfforts?: string[];
  defaultEffort?: string;
  /** false for always_on reasoners that cannot turn thinking off. */
  canDisableThinking?: boolean;
  /** thinking_budget control only. */
  thinkingBudget?: ReasoningBudget;
  request?: ReasoningRequestPaths;
  /**
   * GPT-5.6 Ultra multi-agent (Responses API only). Object form carries the exact
   * params; inert this wave (5.6 is coming_soon and the web route uses chat/completions).
   */
  ultraMode?: ReasoningUltraMode | boolean;
  /** GPT-5.6 Pro mode (reasoning.mode:"pro", Responses-only). Inert this wave. */
  proMode?: { param: string; value: string; endpoint: 'responses' };
  /** GPT-5.6 persistent reasoning (reasoning.context, Responses-only). Inert this wave. */
  persistentReasoning?: {
    param: string;
    values: string[];
    continuationParam?: string;
    zdrInclude?: string[];
    endpoint: 'responses';
  };
}

/**
 * Availability axis — SEPARATE from lifecycle `status`. `status`/`deprecated`
 * REMOVE a model from the picker; `availability` controls SELECTABILITY while the
 * row stays VISIBLE. Absent ⇒ "live".
 *   - live         → selectable + routable (default).
 *   - coming_soon  → shown grayed, NOT selectable, NEVER routable (guardrail-enforced).
 *   - unavailable  → shown disabled with a hard reason; same non-routable guarantee.
 */
export type ModelAvailability = 'live' | 'coming_soon' | 'unavailable';

/**
 * INERT authored tier policy (Addendum B). Nothing derives `tierAllowedModels`
 * from this yet — it is future GA-wave data. `tierAllowedModels` remains the SSOT.
 */
export interface ModelTierPolicy {
  minTier?: 'free' | 'basic' | 'pro' | 'max' | 'enterprise';
  budgetFloorFor?: string[];
  retainOnNextGenGA?: boolean;
  retireFromSelectableOn?: string;
  keepForBudgetTier?: boolean;
}

/** Full model metadata entry as defined in models.json. */
export interface ModelMetadata {
  id: string;
  /** Optional API-specific model ID (e.g., "mistral-medium-2508"). */
  apiModelId?: string;
  name: string;
  provider: Provider;
  modelType: ModelType;
  /** Provider-supported input modalities for specialized multimodal models. */
  inputModalities?: Array<'text' | 'image' | 'audio' | 'video' | 'pdf'>;
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
  /** Cost per million cached input tokens (USD), when the provider supports prompt caching. */
  cached_input?: number;
  /** Cost per million cache write/create tokens (USD), when reported separately. */
  cached_write?: number;
  /** Cost per million one-hour cache write/create tokens (USD), when supported. */
  cached_write_1h?: number;
  /** Per-image cost (USD) for image-generation models (non-token pricing). */
  imagePerImageCost?: number;
  /**
   * Which upstream image API/adapter serves this image model. Lets the media
   * route dispatch to the correct backend purely from catalog data — adding a
   * new image model on an existing backend is a models.curation.json edit, no
   * code change. Only `modelType: 'image'` models set this.
   *   - 'gemini'    → Gemini `:generateContent` (responseModalities IMAGE)
   *   - 'imagen'    → Imagen `:predict`
   *   - 'openai'    → OpenAI Images API
   *   - 'stability' → Stability v2beta Stable Image
   */
  imageApi?: 'gemini' | 'imagen' | 'openai' | 'stability';
  /** Per-second cost (USD) for video-generation models (non-token pricing). */
  videoPerSecondCost?: number;
  /** Resolution-specific per-second video price when the provider varies pricing by output size. */
  videoPerSecondCostByResolution?: Partial<Record<'720p' | '1080p' | '4k', number>>;
  /** Human-readable note for non-standard pricing (per-image, tiered, etc.). */
  pricingNote?: string;
  /** ISO date after which the model is deprecated; null/absent = not scheduled. */
  deprecation_date?: string | null;
  /** ISO timestamp after which promotional pricing reverts to post_promo_prices. */
  promo_expires_at?: string | null;
  /** Standard prices that take effect once promo_expires_at has passed. */
  post_promo_prices?: {
    input: number;
    output: number;
    cached_input?: number;
    cached_write?: number;
    cached_write_1h?: number;
  };
  /** Tokenizer drift multiplier vs the catalog baseline (cost/latency estimation safety). */
  tokenizer_drift_factor?: number;
  tokenizer_drift_range?: { min: number; max: number; unit: string };
  tokenizer_drift_warning?: string;
  /** Legacy/EOL model ids this model supersedes (deprecation-forward redirect aid). */
  supersedes?: string[];
  supersedes_effective_date?: string;
  supersedes_note?: string;
  /**
   * UNIFIED EXECUTION ARCHITECTURE: every model is an intelligence engine that emits
   * JSON tool calls — none has a native cloud execution environment via its standard
   * API. E2B is the UNIVERSAL, centralized secure execution layer: whenever ANY model
   * emits a tool call that runs code or creates files/folders, that execution is
   * routed through the SAME E2B sandbox. E2B is NOT a fallback for "weaker" models.
   *
   * `requiresEnvironment` is therefore a GATING signal, NOT a per-model executor
   * selector: it flags a model whose agentic value DEPENDS on that universal
   * environment being live, so pickers gray it out until the environment is
   * configured + reachable. Absent/undefined = no gating (the default — every current
   * model). Like `imageApi`, it is catalog-driven: a models.curation.json edit, no
   * code change.
   *   - 'e2b'           → depends on the managed-cloud E2B execution layer being live.
   *                       MANAGED-CLOUD ONLY: hard-gated behind the managed-compute
   *                       gate, never auto-routed from Local/BYOK.
   *   - 'local-runtime' → an on-device local model runtime must be installed.
   */
  requiresEnvironment?: 'e2b' | 'local-runtime';
  /** Additive per-model reasoning capability metadata. Absent ⇒ non-reasoning. */
  reasoning?: ModelReasoning;
  /** Selectability axis (separate from lifecycle `status`). Absent ⇒ "live". */
  availability?: ModelAvailability;
  /** Human-readable reason shown on coming_soon/unavailable rows. */
  unavailableReason?: string;
  /** Optional display-only expected-live date for coming_soon rows. */
  expectedLiveDate?: string;
  /** INERT authored tier policy (future GA wave). `tierAllowedModels` stays the SSOT. */
  tierPolicy?: ModelTierPolicy;
  /** GPT-5.6 capability hint (Sol 6 / Terra 4 / Luna 3) from the OpenAI compare page. */
  reasoningDots?: number;
  /** GPT-5.6 programmatic-tool-calling surface (Responses-only, inert this wave). */
  toolCalling?: {
    programmatic?: {
      toolType: string;
      optInParam: string;
      optInValues: string[];
      runtime: string;
      responseItems: string[];
      endpoint: 'responses';
    };
  };
  /** GPT-5.6 image-input detail levels (chat + responses). */
  imageInput?: { detailValues: string[] };
  /** GPT-5.6 supported endpoints. */
  endpoints?: string[];
  /** Model knowledge cutoff date (ISO). */
  knowledgeCutoff?: string;
  /**
   * INERT long-context price tier (GPT-5.6, Addendum D). 5.6-only additive
   * sub-block; the AT-GA metering wave applies a per-request context-length split.
   * Nothing reads it this wave.
   */
  longContext?: {
    inputCost: number;
    cached_input?: number;
    cached_write?: number;
    outputCost: number;
  };
  /** GPT-5.6 prompt-cache policy. */
  cachePolicy?: {
    writeMultiplier: number;
    readDiscount: number;
    minCacheLifeMin: number;
    explicitBreakpoints: boolean;
  };
}

/** The set of hosted execution environments a model may require. */
export const MODEL_ENVIRONMENTS = ['e2b', 'local-runtime'] as const;
export type ModelEnvironment = (typeof MODEL_ENVIRONMENTS)[number];

/**
 * Runtime availability of a model's required execution environment. Mirrors
 * {@link ProviderHealthStatus} — env-availability is RUNTIME state ("is E2B
 * configured + reachable?"), NOT a static tier, so it must be threaded into the
 * pickers separately from the pure tier/access logic.
 */
export interface EnvironmentAvailability {
  /** Whether the environment is configured (e.g. managed-compute beta enabled / runtime installed). */
  configured: boolean;
  /** Whether the environment is currently reachable (optional; defaults to `configured`). */
  available?: boolean;
}

/**
 * Decide whether a model is selectable given its environment requirement and the
 * runtime availability of that environment. Returns a structured verdict so each
 * surface's picker can gray-out + show a distinct lock reason.
 *
 * Fail-closed: a model that requires an environment is NOT selectable unless that
 * environment is both configured AND available. A model with no requirement is
 * always environment-OK (its other gates — tier, provider key — apply separately).
 */
export function evaluateModelEnvironment(
  requiresEnvironment: ModelEnvironment | undefined,
  availability: EnvironmentAvailability | undefined,
): { selectable: boolean; reason?: string } {
  if (!requiresEnvironment) return { selectable: true };
  const configured = availability?.configured === true;
  const available = availability?.available ?? configured;
  if (configured && available) return { selectable: true };
  const reason =
    requiresEnvironment === 'e2b'
      ? 'Requires managed compute (currently in private beta)'
      : 'Requires a local model runtime to be installed';
  return { selectable: false, reason };
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

export interface AutoRoutingProfileView {
  id: AutoModeModelId;
  profile: 'economy' | 'balanced' | 'premium';
  label: string;
  description: string;
}

/** Selectable Auto profiles in canonical economy → balanced → premium order. */
export function getAutoRoutingProfiles(): AutoRoutingProfileView[] {
  const policy = modelRegistry.policies.auto as unknown as {
    profileOrder: Array<AutoRoutingProfileView['profile']>;
    aliases: Record<
      string,
      {
        profile: AutoRoutingProfileView['profile'];
        label: string;
        description: string;
        selectable: boolean;
      }
    >;
  };

  return policy.profileOrder.flatMap((profile) => {
    const entry = Object.entries(policy.aliases).find(
      ([, alias]) => alias.profile === profile && alias.selectable,
    );
    if (!entry) return [];
    const [id, alias] = entry;
    return [
      {
        id: id as AutoModeModelId,
        profile,
        label: alias.label,
        description: alias.description,
      },
    ];
  });
}

/** True only for canonical Auto routing-profile identifiers, never provider models. */
export function isAutoModeModelId(modelId: string | null | undefined): modelId is AutoModeModelId {
  return (
    typeof modelId === 'string' &&
    Object.prototype.hasOwnProperty.call(modelRegistry.policies.auto.aliases, modelId)
  );
}

export type ProductTier = 'free' | 'pro' | 'max' | 'enterprise';
export type ProviderSurface = 'managed_cloud' | 'byok' | 'local' | 'hidden';
export type TierSurfaceMode = 'auto_only' | 'auto_plus_manual';
export type RoutingSlot = keyof typeof modelRegistry.policies.auto.slots;

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
 * Compatibility cap thresholds retained for legacy quota consumers:
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
 * Routing requirements and slot assignments now live in
 * `packages/ai/model-registry/catalog/routing-policies.json`. This interface
 * remains the compatibility shape for product entitlements and quota gates.
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
   * Aliased mirror of `manualModelSelection` for the Advanced-mode toggle.
   * Populated wherever `manualModelSelection`
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
   * Per-day token cap for Pro+ flagship routing slots. Above this cap,
   * flagship requests fall through to the configured non-flagship Pro slots.
   * The actual models live in `SLOT_REGISTRY`; do not duplicate their IDs here.
   * Enforced by `assertQuota` daily-cap check using `token_credits.daily_used_cents`.
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
const REGISTRY_HARNESSES = modelRegistry.harnesses as Record<
  string,
  { provider: string; apiFamily: string; trustModes: readonly string[] }
>;
const WEB_CLOUD_RUNTIME_PROFILE = modelRegistry.runtimeProfiles['web/cloud-chat'];
const MANAGED_CLOUD_PROVIDER_IDS = [
  ...new Set(
    WEB_CLOUD_RUNTIME_PROFILE.allowedHarnessIds
      .map((harnessId) => {
        const harness = REGISTRY_HARNESSES[harnessId];
        if (!harness) {
          throw new Error(`Runtime profile references unknown harness: ${harnessId}`);
        }
        return harness;
      })
      .filter((harness) => harness.apiFamily !== 'media' && harness.provider !== 'managed_cloud')
      .map((harness) => harness.provider),
  ),
] as Provider[];
const SEARCH_ONLY_MANAGED_CLOUD_PROVIDER_IDS = MANAGED_CLOUD_PROVIDER_IDS.filter((provider) => {
  const providerModelKeys = modelRegistry.providerModelKeys as Record<string, readonly string[]>;
  const modelKeys = providerModelKeys[provider] ?? [];
  return (
    modelKeys.length > 0 &&
    modelKeys.every(
      (modelKey) =>
        modelRegistry.models[modelKey as keyof typeof modelRegistry.models].identity.kind ===
        'search',
    )
  );
});
const MANAGED_CLOUD_PROVIDER_SET = new Set<string>(
  Object.values(REGISTRY_HARNESSES)
    .filter((harness) => harness.trustModes.includes('managed_cloud'))
    .map((harness) => harness.provider),
);
const BYOK_PROVIDER_IDS = [
  ...new Set(
    Object.values(REGISTRY_HARNESSES)
      .filter(
        (harness) =>
          harness.trustModes.includes('byok') && !harness.trustModes.includes('managed_cloud'),
      )
      .map((harness) => harness.provider),
  ),
];
const LOCAL_PROVIDER_IDS = [
  ...new Set(
    Object.values(REGISTRY_HARNESSES)
      .filter((harness) => harness.trustModes.includes('local'))
      .map((harness) => harness.provider),
  ),
];
const SEARCH_ONLY_MANAGED_CLOUD_PROVIDER_SET = new Set<string>(
  SEARCH_ONLY_MANAGED_CLOUD_PROVIDER_IDS,
);
const BYOK_PROVIDER_SET = new Set<string>(BYOK_PROVIDER_IDS);
const LOCAL_PROVIDER_SET = new Set<string>(LOCAL_PROVIDER_IDS);
// Derived from models.json (the locked source of truth). Manual chat surfaces
// admit only conversational model kinds; specialized image/video/voice/
// embedding models have their own workflows and must never leak into chat
// pickers merely because they are present in the registry. Insertion order
// from the JSON is preserved so UI ordering remains stable.
const MANUAL_OVERRIDE_MODEL_TYPES = new Set<ModelType>([
  'chat',
  'code',
  'reasoning',
  'multimodal',
  'search',
]);
const MANUAL_OVERRIDE_MODEL_IDS: readonly string[] = Object.entries(
  modelsCatalogJson.models as Record<string, ModelMetadata>,
)
  .filter(([, model]) => {
    if (model.deprecated) return false;
    if (model.status === 'deprecated') return false;
    // 'experimental' is not in the current ModelStatus union but guard for
    // future expansion so preview-only models are excluded.
    if ((model.status as string | undefined) === 'experimental') return false;
    return MANUAL_OVERRIDE_MODEL_TYPES.has(model.modelType);
  })
  .map(([id]) => id);
const MANUAL_OVERRIDE_MODEL_SET = new Set<string>(MANUAL_OVERRIDE_MODEL_IDS);

// ============================================================================
// SLOT_REGISTRY — generated compatibility view
//
// Model assignments and presentation metadata are compiled from the shared
// registry. A model release therefore changes only models.curation.json and,
// when its Auto-routing role changes, routing-policies.json.
// ============================================================================
type RegistryRoutingSlot = (typeof modelRegistry.policies.auto.slots)[RoutingSlot];

export const SLOT_REGISTRY: Readonly<Record<RoutingSlot, RoutingSlotDefinition>> = Object.freeze(
  Object.fromEntries(
    (
      Object.entries(modelRegistry.policies.auto.slots) as Array<[RoutingSlot, RegistryRoutingSlot]>
    ).map(([slot, registrySlot]) => {
      const modelId = registrySlot.modelKey as keyof typeof modelRegistry.models;
      return [
        slot,
        {
          slot,
          label: registrySlot.label,
          description: registrySlot.description,
          modelId,
          provider: modelRegistry.models[modelId].identity.provider,
        },
      ];
    }),
  ) as Record<RoutingSlot, RoutingSlotDefinition>,
);
// ---------------------------------------------------------------------------
// Compatibility product-tier entitlements and quota policy.
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
    // Free chat exposes the workhorse plus voice. Dev-level agents, computer use,
    // Deep Research, image generation, and premium escalation remain paid.
    allowedSlots: ['workhorse_general', 'voice_transcription', 'voice_rewrite'],
    allowedProviderSurfaces: ['managed_cloud'],
    manualModelSelection: false,
    allowManualSelection: false,
    allowBrowserDom: false,
    allowComputerUse: false,
    allowSearch: true,
    allowMediaGeneration: false,
    allowImageGeneration: false,
    allowVideoGeneration: false,
    allowToolUse: true,
    allowMCP: 'one_custom_remote',
    allowDeepResearch: false,
    allowVoice: true,
    // The free usage ceiling is intentionally private and dynamic. It lives in
    // the server-only free-trial service, never this client-shared registry.
    tokenCapPerMonth: null,
    messagesPerDayCap: null,
  },
  pro: {
    tier: 'pro',
    // Pro surfaces both Auto and the Advanced-mode manual picker per
    // Advanced-mode manual selection toggle.
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
    tokenCapPerMonth: 40_000_000,
    // Daily cap on flagship model usage — Pro gets picker access but not
    // unlimited flagship burns. 50K/day ~ 30-50 long messages with top models.
    // Clearly above Free (100K/mo) and below Max (100M/mo, no flagship daily cap).
    // FLAG FOR FOUNDER CONFIRMATION: raised from 20M/mo to 40M/mo and 15K/day to 50K/day.
    flagshipDailyTokenCap: 50_000,
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
    // Max-tier video budget: 5 min/mo through the current Pro+ video route.
    videoSecondsPerMonth: 300,
    // Max computer-use ladder: warn at 1K actions, paywall at 2.5K. Spec §3.
    computerUseSoftCap: 1_000,
    computerUseHardCap: 2_500,
    // Max enables Deep Research workflows.
    allowDeepResearch: true,
    allowToolUse: 'unlimited',
    allowMCP: 'unlimited',
    tokenCapPerMonth: 100_000_000,
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
 * Compatibility alias for tests + `apps/web/lib/assert-quota.ts`.
 * Same reference; do not mutate.
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
  // Earlier catalogs allowed provider aliases to overwrite canonical entries.
  // Current routing uses explicit current model IDs and only accepts aliases as
  // non-selectable compatibility lookups.
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
    const meta = modelsById[slot.modelId];
    if (!meta) {
      throw new Error(
        `SLOT_REGISTRY references unknown model: ${slot.modelId} (slot: ${slot.slot}). ` +
          `Update model-registry curation or routing policy, then regenerate.`,
      );
    }
    // Provider-match: a slot's declared provider must equal the model's actual
    // provider in models.json. Otherwise the routing slot silently points at the
    // wrong vendor (e.g. modelId 'gpt-5.4-mini' but provider 'google'), which the
    // modelId-only check above would miss. Fail loudly at import, like the rest.
    if (slot.provider && meta.provider && slot.provider !== meta.provider) {
      throw new Error(
        `SLOT_REGISTRY slot "${slot.slot}" declares provider "${slot.provider}" but model ` +
          `"${slot.modelId}" belongs to provider "${meta.provider}" in models.json. ` +
          `Fix the slot's provider or modelId.`,
      );
    }
  }
  // Any model declaring `requiresEnvironment` must name a known environment, so a
  // typo in models.json fails loudly at import instead of silently never gating
  // (which would expose an env-gated model as if it had no requirement).
  const knownEnvironments = new Set<string>(MODEL_ENVIRONMENTS);
  for (const model of Object.values(modelsById)) {
    const env = model.requiresEnvironment as string | undefined;
    if (env !== undefined && !knownEnvironments.has(env)) {
      throw new Error(
        `Model "${model.id}" declares unknown requiresEnvironment: "${env}". ` +
          `Allowed: ${MODEL_ENVIRONMENTS.join(', ')}. Fix packages/contracts/types/src/models.json.`,
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

export function requireProviderDefaultModel(provider: Provider | string): string {
  const modelId = getProviderDefaultModel(provider);
  if (!modelId) {
    throw new Error(`No default model configured for provider: ${provider}`);
  }
  return modelId;
}

function normalizeProductTier(tier: string | null | undefined): ProductTier {
  // Product-feature policy remains broader than model admission. Model lists
  // use normalizeSubscriptionAccessTier; Basic must never inherit Pro models.
  switch ((tier ?? '').toLowerCase()) {
    case 'pro':
    case 'team':
    case 'basic':
    case 'hobby':
      return 'pro';
    case 'max':
    case 'max+':
    case 'max_plus':
    case 'max-plus':
      return 'max';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'free';
  }
}

function normalizeAutoRoutingTier(tier: string | null | undefined): ProductTier | 'byok' {
  if ((tier ?? '').toLowerCase() === 'byok') return 'byok';
  return normalizeSubscriptionAccessTier(tier ?? 'free') === 'basic'
    ? 'free'
    : normalizeProductTier(tier);
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
 * `js-set-map-lookups`). Declaration order in the generated routing policy is
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

/** Canonical subscription tiers used by every cloud-model picker and server gate. */
export type SubscriptionAccessTier = 'free' | 'basic' | 'pro' | 'max' | 'enterprise';

export function normalizeSubscriptionAccessTier(tier: string): SubscriptionAccessTier {
  switch (tier.toLowerCase()) {
    case 'basic':
    case 'hobby':
      return 'basic';
    case 'pro':
    case 'team':
      return 'pro';
    case 'max':
    case 'max+':
    case 'max_plus':
    case 'max-plus':
      return 'max';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'free';
  }
}

/**
 * Minimum paid subscription tier required to use `modelId`, or null when the
 * model is not in any selectable subscription roster.
 */
export function getMinimumRequiredTier(modelId: string): 'basic' | 'pro' | 'max' | null {
  const canonicalModelId = normalizeModelId(modelId.toLowerCase());
  if (!canonicalModelId) return null;
  if (getAllowedModelsForTier('flagship_additions').includes(canonicalModelId)) return 'max';
  if (getAllowedModelsForTier('pro_additions').includes(canonicalModelId)) return 'pro';
  if (getAllowedModelsForTier('economy').includes(canonicalModelId)) return 'basic';
  return null;
}

/** True if a user on `subscriptionTier` can use `modelId`, per the shared catalog gate. */
export function canAccessModelForSubscriptionTier(
  modelId: string,
  subscriptionTier: string,
): boolean {
  const tier = normalizeSubscriptionAccessTier(subscriptionTier);
  if (tier === 'free') return false;

  const canonicalModelId = normalizeModelId(modelId.toLowerCase());
  if (!canonicalModelId) return false;

  if (getAllowedModelsForTier('flagship_additions').includes(canonicalModelId)) {
    return tier === 'max' || tier === 'enterprise';
  }
  if (getAllowedModelsForTier('pro_additions').includes(canonicalModelId)) {
    return tier === 'pro' || tier === 'max' || tier === 'enterprise';
  }
  return getAllowedModelsForTier('economy').includes(canonicalModelId);
}

export function listCanonicalModels(): ModelMetadata[] {
  return Object.values(modelsCatalog.models);
}

export function getModels(options: ModelQueryOptions = {}): ModelMetadata[] {
  return listCanonicalModels().filter((model) => matchesModelQueryOptions(model, options));
}

/** Availability of a model (absent field ⇒ "live"). */
export function getModelAvailability(model: ModelMetadata): ModelAvailability {
  return model.availability ?? 'live';
}

/** True when a model is live (selectable + routable). */
export function isModelLive(model: ModelMetadata): boolean {
  return getModelAvailability(model) === 'live';
}

/**
 * The reasoning capability block for a model (absent ⇒ non-reasoning `none`).
 * Single source both the effort-flyout UI and the request path read from.
 */
export function getModelReasoning(modelId: string | null | undefined): ModelReasoning {
  const meta = getModelMetadataById(modelId);
  return meta?.reasoning ?? { capable: false, control: 'none' };
}

/**
 * DISPLAY set — every non-deprecated model INCLUDING `coming_soon`. Drives the
 * picker list + ordering. `coming_soon` rows render disabled (see getSelectableModels).
 * `unavailable` rows are also shown-but-disabled.
 */
export function getDisplayModels(): ModelMetadata[] {
  return getManualOverrideModels();
}

/**
 * SELECTABLE set — `getDisplayModels()` filtered to `availability === "live"`.
 * Drives what can actually be picked/sent. `coming_soon`/`unavailable` are
 * display-only and NEVER selectable/routable. Environment gating is applied per
 * surface separately (evaluateModelEnvironment) since it is runtime state.
 */
export function getSelectableModels(): ModelMetadata[] {
  return getDisplayModels().filter(isModelLive);
}

/** True when a model id resolves to a live (selectable) catalog entry. */
export function isModelSelectable(modelId: string | null | undefined): boolean {
  const meta = getModelMetadataById(modelId);
  return meta ? isModelLive(meta) : false;
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

function getIndexedModelsForProvider(provider: Provider | string): ModelMetadata[] {
  const providerModelKeys = modelRegistry.providerModelKeys as Record<string, readonly string[]>;
  const modelKeys = providerModelKeys[provider];
  if (!modelKeys) return [];

  return modelKeys.map((modelKey) => {
    const meta = modelsCatalog.models[modelKey];
    if (!meta) {
      throw new Error(`Generated provider index references unknown model: ${modelKey}`);
    }
    return meta;
  });
}

export function getModelsForProvider(
  provider: Provider | string,
  options: ModelQueryOptions = {},
): ModelMetadata[] {
  return getIndexedModelsForProvider(provider).filter((model) =>
    matchesModelQueryOptions(model, options),
  );
}

/**
 * Project canonical metadata into the lightweight provider-adapter catalog shape.
 * Provider membership and ordering come from the generated registry index so
 * adapters never maintain parallel model lists or repeat projection logic.
 */
export function getProviderModelCatalog(provider: Provider | string): readonly ModelInfo[] {
  return getIndexedModelsForProvider(provider).map((meta) => {
    return {
      id: meta.id,
      ...(meta.name !== undefined ? { name: meta.name } : {}),
      provider: meta.provider,
      ...(meta.contextWindow !== undefined ? { contextWindow: meta.contextWindow } : {}),
      ...(meta.maxOutputTokens !== undefined ? { maxOutputTokens: meta.maxOutputTokens } : {}),
      ...(meta.capabilities ? { capabilities: meta.capabilities } : {}),
      ...(meta.inputCost !== undefined ? { inputCostPerMillion: meta.inputCost } : {}),
      ...(meta.outputCost !== undefined ? { outputCostPerMillion: meta.outputCost } : {}),
    } satisfies ModelInfo;
  });
}

/**
 * Return providers with at least one harness whose feature is implemented.
 * This queries generated execution facts rather than intrinsic model
 * capabilities, keeping route support separate from what a model advertises.
 */
export function getProvidersWithImplementedHarnessFeature(feature: string): string[] {
  const providers = new Set<string>();

  for (const harness of Object.values(modelRegistry.harnesses)) {
    const features = harness.features as Record<
      string,
      { providerSupport: string; implementation: string } | undefined
    >;
    if (features[feature]?.implementation === 'implemented') {
      providers.add(harness.provider);
    }
  }

  return [...providers];
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

/**
 * Set of provider identifiers that the US-only routing toggle excludes.
 * Derived from the canonical routing policy and frozen at module load.
 */
export const NON_US_PROVIDERS: ReadonlySet<string> = Object.freeze(
  new Set<string>(modelRegistry.policies.auto.providerPolicies.usOnly.excludedProviders),
);

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
  const autoPolicy = modelRegistry.policies.auto;
  const normalizedMode = (autoMode ?? autoPolicy.defaultAlias).toLowerCase();
  const normalizedTier = normalizeAutoRoutingTier(subscriptionTier);
  const alias = autoPolicy.aliases[normalizedMode as keyof typeof autoPolicy.aliases];
  if (!alias) {
    return normalizeModelId(normalizedMode);
  }

  const requestedProfileIndex = autoPolicy.profileOrder.indexOf(alias.profile);
  const maximumProfile = autoPolicy.tierMaximumProfiles[normalizedTier];
  const maximumProfileIndex = autoPolicy.profileOrder.indexOf(maximumProfile);
  const effectiveProfile =
    autoPolicy.profileOrder[Math.min(requestedProfileIndex, maximumProfileIndex)] ?? maximumProfile;
  const effectiveTaskType = taskType ?? 'general';
  const taskPolicy = autoPolicy.tasks[effectiveTaskType];
  if (!taskPolicy) return null;

  const allowedSlots = new Set(autoPolicy.tierAllowedSlots[normalizedTier]);
  const usOnlyPolicy = autoPolicy.providerPolicies.usOnly;
  const applyUsOnly =
    options?.usOnly === true && usOnlyPolicy.allowedTiers.includes(normalizedTier);

  const preferredSlots =
    taskPolicy.preferredSlots[effectiveProfile as keyof typeof taskPolicy.preferredSlots];
  for (const slotId of preferredSlots) {
    if (!allowedSlots.has(slotId)) continue;
    const modelKey = autoPolicy.slots[slotId as keyof typeof autoPolicy.slots]?.modelKey;
    if (!modelKey) continue;
    const provider =
      modelRegistry.models[modelKey as keyof typeof modelRegistry.models]?.identity.provider;
    if (applyUsOnly && provider && usOnlyPolicy.excludedProviders.includes(provider)) continue;
    return modelKey;
  }

  const fallbackSlot = autoPolicy.fallbackSlot;
  return allowedSlots.has(fallbackSlot)
    ? (autoPolicy.slots[fallbackSlot as keyof typeof autoPolicy.slots]?.modelKey ?? null)
    : null;
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
 * Slot assignments come from the generated model registry; product entitlement
 * order remains owned by `TIER_POLICIES` in this compatibility layer.
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
 * reflects the generated registry — never a hardcoded literal.
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
  const accessTier = normalizeSubscriptionAccessTier(tier ?? 'free');
  const normalizedTier = accessTier === 'basic' ? 'free' : normalizeProductTier(tier);
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

interface RegistryRuntimeProfileView {
  trustMode: string;
  status: string;
  allowedHarnessIds: readonly string[];
}

interface RegistryRouteView {
  modelKey: string;
  harnessId: string;
  trustModes: readonly string[];
  availability: string;
  selectable: boolean;
}

/**
 * Returns picker models admitted by a canonical surface/runtime profile.
 *
 * This is the surface-safe alternative to maintaining provider or model
 * allowlists inside Web, Desktop, Mobile, or extension code. An unavailable,
 * partial, unwired, or unknown profile intentionally returns no selectable
 * rows: presentation must not outrun the runtime that can execute a model.
 */
export function getPickerModelsForRuntimeProfile(
  runtimeProfileId: string,
  options: PickerModelOptions = {},
): PickerModelView[] {
  const runtimeProfiles = modelRegistry.runtimeProfiles as Record<
    string,
    RegistryRuntimeProfileView
  >;
  const profile = runtimeProfiles[runtimeProfileId];
  if (!profile || profile.status !== 'implemented') return [];

  const allowedHarnessIds = new Set(profile.allowedHarnessIds);
  const admittedModelKeys = new Set(
    (Object.values(modelRegistry.routes) as RegistryRouteView[])
      .filter(
        (route) =>
          route.selectable &&
          route.availability === 'live' &&
          route.trustModes.includes(profile.trustMode) &&
          allowedHarnessIds.has(route.harnessId),
      )
      .map((route) => route.modelKey),
  );

  return getPickerModels(options).filter((model) => admittedModelKeys.has(model.id));
}

/**
 * Returns the single canonical model list for a subscription tier on a runtime
 * surface. A model must pass both the real runtime profile and tier policy;
 * unavailable surfaces intentionally receive an empty list.
 */
export function getModelsForTierAndSurface(
  subscriptionTier: string,
  runtimeProfileId: string,
  options: PickerModelOptions = {},
): PickerModelView[] {
  return getPickerModelsForRuntimeProfile(runtimeProfileId, options).filter((model) =>
    canAccessModelForSubscriptionTier(model.id, subscriptionTier),
  );
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
