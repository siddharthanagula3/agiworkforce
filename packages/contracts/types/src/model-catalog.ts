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

import modelsCatalogJson from './models.json';
import {
  modelRegistry,
  type ModelCapabilityName,
  type ModelCapabilityValue,
  type RouteCommercialStatus,
} from '@agiworkforce/model-registry';

export {
  getRoutePricing,
  getProviderCacheTokenBillingClass,
  getProviderComputePricing,
} from '@agiworkforce/model-registry';
export type {
  RoutePriceSheet,
  RouteCommercialStatus,
  CacheTokenBillingClass,
  ComputePricingUnit,
  ProviderComputePricing,
} from '@agiworkforce/model-registry';

export interface RegistryRoute {
  modelKey: string;
  provider: string;
  harnessId: string;
  trustModes: readonly string[];
  isDefault: boolean;
  commercialStatus: RouteCommercialStatus;
}

export function getRegistryRoute(routeId: string): RegistryRoute | null {
  const routes = modelRegistry.routes as Readonly<Record<string, RegistryRoute>>;
  return routes[routeId] ?? null;
}
import type { Provider } from './provider';
import type { ModelInfo } from './provider-adapter';
import type { SubscriptionTier } from './user';
import type { Effort } from './design-system/effort';
export type { Provider };

export type { ModelCapabilityName, ModelCapabilityValue };

export type NormalizedModelCapabilities = Readonly<
  Partial<Record<ModelCapabilityName, ModelCapabilityValue>>
>;

export const COMPAT_CAPABILITY_SOURCES = {
  streaming: 'streaming',
  tools: 'functionCalling',
  vision: 'imageInput',
  json: 'structuredOutput',
  thinking: 'reasoning',
  computerUse: 'computerUse',
  agentic: 'agentic',
  imageGen: 'imageOutput',
  videoGen: 'videoOutput',
  search: 'webSearch',
  research: 'deepResearch',
  codeExecution: 'codeExecution',
  caching: 'promptCaching',
} as const satisfies Readonly<Record<string, ModelCapabilityName>>;

export type ModelCapabilities = Record<keyof typeof COMPAT_CAPABILITY_SOURCES, boolean>;

export const INTRINSIC_CAPABILITY_NAMES: readonly ModelCapabilityName[] = modelRegistry
  .capabilityClasses.intrinsic as readonly ModelCapabilityName[];

export const ROUTE_DEPENDENT_CAPABILITY_NAMES: readonly ModelCapabilityName[] = modelRegistry
  .capabilityClasses.routeDependent as readonly ModelCapabilityName[];

export function projectModelCapabilities(
  capabilities: NormalizedModelCapabilities,
): ModelCapabilities {
  return Object.fromEntries(
    Object.entries(COMPAT_CAPABILITY_SOURCES).map(([compatName, capabilityName]) => [
      compatName,
      capabilities[capabilityName] === true,
    ]),
  ) as ModelCapabilities;
}

export interface VideoGenerationOutputSize {
  resolution: string;
  aspectRatio: string;
  width: number;
  height: number;
  durationSecs?: number[];
}

export interface VideoTokenPricingFormula {
  unit: 'video_tokens';
  framesPerSecond: number;
  pixelsPerToken: number;
  usdPerToken: number;
  usdPerTokenWithoutAudio?: number;
  usdPerTokenWithVideoInput?: number;
}

export interface VideoGenerationMetadata {
  durationSecs: number[];
  outputSizes: VideoGenerationOutputSize[];
  supportsAudio: boolean;
  supportsSeed?: boolean;
  pricing?: VideoTokenPricingFormula;
}

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

export type ModelSpeed = 'very-fast' | 'fast' | 'medium' | 'slow';

export type ModelQuality = 'excellent' | 'good' | 'fair';

export type ModelQualityTier = 'fast' | 'balanced' | 'best';
export type PickerModelTier = 'economy' | 'balanced' | 'premium';

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

export type ModelStatus = 'active' | 'beta' | 'deprecated';

export type ReasoningControl =
  | 'none'
  | 'always_on'
  | 'thinking_toggle'
  | 'thinking_budget'
  | 'effort_levels';

export interface ReasoningRequestPaths {
  api: 'chat' | 'responses' | 'messages' | 'gen';
  effortPath?: string | null;
  responsesEffortPath?: string | null;
  togglePath?: string | null;
  budgetPath?: string | null;
}

export interface ReasoningBudget {
  min: number;
  max: number;
  default: number;
}

export interface ReasoningUltraMode {
  enabled: boolean;
  param: string;
  concurrencyParam?: string;
  beta?: string;
  endpoint: 'responses';
  responseItems?: string[];
}

export interface ModelReasoning {
  capable: boolean;
  control: ReasoningControl;
  supportedEfforts?: Effort[];
  defaultEffort?: Effort;
  canDisableThinking?: boolean;
  thinkingDefault?: 'disabled' | 'adaptive' | 'enabled';
  supportsManualThinking?: boolean;
  maxEffortWhenThinkingDisabled?: Effort;
  rejectsSamplingParameters?: boolean;
  thinkingBudget?: ReasoningBudget;
  request?: ReasoningRequestPaths;
  /**
   * Authored provider capability with no transport behind it: every field below is
   * `endpoint: 'responses'`, and no surface in this repo speaks the Responses API.
   * chat goes out over `/chat/completions`. Nothing may read these into an outgoing
   * request until a Responses transport exists, or the provider rejects the call.
   */
  ultraMode?: ReasoningUltraMode | boolean;
  proMode?: { param: string; value: string; endpoint: 'responses' };
  persistentReasoning?: {
    param: string;
    values: string[];
    continuationParam?: string;
    zdrInclude?: string[];
    endpoint: 'responses';
  };
}

export type ModelAvailability = 'live' | 'coming_soon' | 'unavailable';

export interface ModelTierPolicy {
  minTier?: 'free' | 'basic' | 'pro' | 'max' | 'enterprise';
  budgetFloorFor?: string[];
  retainOnNextGenGA?: boolean;
  retireFromSelectableOn?: string;
  keepForBudgetTier?: boolean;
}

export interface ModelPricingWindow {
  effectiveFrom?: string;
  effectiveUntil?: string;
  note?: string;
  inputCost?: number;
  outputCost?: number;
  cached_input?: number;
  cached_write?: number;
  cached_write_1h?: number;
}

export interface EffectiveModelPricing {
  inputCost: number;
  outputCost: number;
  cached_input?: number | undefined;
  cached_write?: number | undefined;
  cached_write_1h?: number | undefined;
}

export type PricingTierThresholdBoundary = 'inclusive' | 'exclusive';

export interface InputTokenPricingTier {
  thresholdTokens: number;
  thresholdBoundary?: PricingTierThresholdBoundary;
  inputCost: number;
  outputCost: number;
  cached_input?: number;
  cached_write?: number;
  cached_write_1h?: number;
}

/** Pricing-carrying subset of {@link ModelMetadata} that the resolver needs. */
export type PricedModel = Pick<
  ModelMetadata,
  | 'inputCost'
  | 'outputCost'
  | 'cached_input'
  | 'cached_write'
  | 'cached_write_1h'
  | 'pricingSchedule'
  | 'promo_expires_at'
  | 'post_promo_prices'
  | 'inputTokenPricingTiers'
  | 'longContext'
>;

function toIsoDay(asOf: Date): string | null {
  const time = asOf?.getTime?.();
  if (typeof time !== 'number' || Number.isNaN(time)) return null;
  return asOf.toISOString().slice(0, 10);
}

export function resolveEffectiveModelPricing(
  model: PricedModel,
  asOf: Date,
): EffectiveModelPricing {
  const base: EffectiveModelPricing = {
    inputCost: model.inputCost,
    outputCost: model.outputCost,
    cached_input: model.cached_input,
    cached_write: model.cached_write,
    cached_write_1h: model.cached_write_1h,
  };

  const schedule = model.pricingSchedule;
  if (!Array.isArray(schedule) || schedule.length === 0) return base;

  const day = toIsoDay(asOf);
  if (day === null) return base;

  const window = schedule.find(
    (entry) =>
      (entry.effectiveFrom === undefined || entry.effectiveFrom <= day) &&
      (entry.effectiveUntil === undefined || day <= entry.effectiveUntil),
  );
  if (!window) return base;

  return {
    inputCost: window.inputCost ?? base.inputCost,
    outputCost: window.outputCost ?? base.outputCost,
    cached_input: window.cached_input ?? base.cached_input,
    cached_write: window.cached_write ?? base.cached_write,
    cached_write_1h: window.cached_write_1h ?? base.cached_write_1h,
  };
}

export function resolveEffectiveModelPricingForInputTokens(
  model: PricedModel,
  asOf: Date,
  inputTokens: number,
): EffectiveModelPricing {
  const dated = resolveEffectiveModelPricing(model, asOf);
  const postPromo =
    model.post_promo_prices && isModelPromoExpired(model, asOf)
      ? model.post_promo_prices
      : undefined;
  return applyInputTokenPricingTiers(
    model,
    {
      inputCost: postPromo?.input ?? dated.inputCost,
      outputCost: postPromo?.output ?? dated.outputCost,
      cached_input: postPromo?.cached_input ?? dated.cached_input,
      cached_write: postPromo?.cached_write ?? dated.cached_write,
      cached_write_1h: postPromo?.cached_write_1h ?? dated.cached_write_1h,
    },
    inputTokens,
  );
}

export function isModelPromoExpired(
  model: Pick<ModelMetadata, 'promo_expires_at'>,
  asOf: Date,
): boolean {
  if (!model.promo_expires_at) return false;
  const cutoff = Date.parse(model.promo_expires_at);
  const asOfTime = asOf?.getTime?.();
  return (
    !Number.isNaN(cutoff) &&
    typeof asOfTime === 'number' &&
    !Number.isNaN(asOfTime) &&
    asOfTime >= cutoff
  );
}

const DEFAULT_PRICING_TIER_THRESHOLD_BOUNDARY: PricingTierThresholdBoundary = 'exclusive';

function admitsPricingTier(candidate: InputTokenPricingTier, inputTokens: number): boolean {
  const boundary = candidate.thresholdBoundary ?? DEFAULT_PRICING_TIER_THRESHOLD_BOUNDARY;
  return boundary === 'inclusive'
    ? inputTokens >= candidate.thresholdTokens
    : inputTokens > candidate.thresholdTokens;
}

export function applyInputTokenPricingTiers(
  model: Pick<ModelMetadata, 'inputTokenPricingTiers' | 'longContext'>,
  base: EffectiveModelPricing,
  inputTokens: number,
): EffectiveModelPricing {
  if (!Number.isFinite(inputTokens)) {
    return base;
  }

  const tiers = Array.isArray(model.inputTokenPricingTiers)
    ? model.inputTokenPricingTiers
    : model.longContext
      ? [model.longContext]
      : [];
  let tier: InputTokenPricingTier | undefined;
  for (const candidate of tiers) {
    if (
      Number.isFinite(candidate.thresholdTokens) &&
      admitsPricingTier(candidate, inputTokens) &&
      (tier === undefined || candidate.thresholdTokens > tier.thresholdTokens)
    ) {
      tier = candidate;
    }
  }
  if (!tier) return base;

  return {
    inputCost: tier.inputCost,
    outputCost: tier.outputCost,
    cached_input: tier.cached_input ?? base.cached_input,
    cached_write: tier.cached_write ?? base.cached_write,
    cached_write_1h: tier.cached_write_1h ?? base.cached_write_1h,
  };
}

/**
 * @deprecated Compatibility alias for callers compiled against the former
 * singleton name. New code must call {@link applyInputTokenPricingTiers}.
 */
export function applyLongContextPricing(
  model: Pick<ModelMetadata, 'inputTokenPricingTiers' | 'longContext'>,
  base: EffectiveModelPricing,
  inputTokens: number,
): EffectiveModelPricing {
  return applyInputTokenPricingTiers(model, base, inputTokens);
}

export interface ModelMetadata {
  id: string;
  apiModelId?: string;
  openRouterSlug?: string;
  name: string;
  provider: Provider;
  modelType: ModelType;
  inputModalities?: Array<'text' | 'image' | 'audio' | 'video' | 'pdf'>;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputCost: number;
  outputCost: number;
  capabilities: ModelCapabilities;
  benchmarks?: ModelBenchmarks;
  speed: ModelSpeed;
  quality: ModelQuality;
  qualityTier: ModelQualityTier;
  bestFor: string[];
  variantPartner?: string;
  released?: string;
  deprecated?: boolean;
  status?: ModelStatus;
  cached_input?: number;
  cached_write?: number;
  cached_write_1h?: number;
  imagePerImageCost?: number;
  imageApi?: 'gemini' | 'imagen' | 'openai' | 'stability';
  imageOutputMimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  videoPerSecondCost?: number;
  videoPerSecondCostByResolution?: Partial<Record<'480p' | '720p' | '1080p' | '4k', number>>;
  videoGeneration?: VideoGenerationMetadata;
  pricingNote?: string;
  /**
   * Dated pricing windows. Each entry is a dated cost override that applies
   * while `effectiveFrom <= date <= effectiveUntil` (both bounds inclusive and
   * both optional; an absent bound is open-ended on that side). The top-level
   * cost fields stay the enduring/standard price so a consumer that is NOT
   * date-aware still reads a published rate. Resolve with
   * {@link resolveEffectiveModelPricing}, never by reading the array directly.
   */
  pricingSchedule?: ModelPricingWindow[];
  openWeight?: boolean;
  /** SPDX-style license id, or `proprietary` for closed API-only models. Absent = unverified. */
  license?: string;
  commercialRestrictions?: string;
  deprecation_date?: string | null;
  promo_expires_at?: string | null;
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
  supersedes?: string[];
  supersedes_effective_date?: string;
  supersedes_note?: string;
  requiresEnvironment?: 'e2b' | 'local-runtime';
  reasoning?: ModelReasoning;
  promptCacheMinimumTokens?: number;
  providerCompatibility?: {
    nativeWebFetch?: boolean;
    /**
     * Whether the provider accepts a FORCED `tool_choice` (`'required'` or a
     * named function) for this model. Some reasoning models reason on every turn
     * and answer a forced choice with HTTP 400 "Thinking mode does not support
     * this tool_choice", which surfaces to the user as an empty turn. `'auto'`
     * and an omitted choice are unaffected.
     */
    forcedToolChoice?: boolean;
  };
  availability?: ModelAvailability;
  unavailableReason?: string;
  expectedLiveDate?: string;
  tierPolicy?: ModelTierPolicy;
  reasoningDots?: number;
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
  imageInput?: { detailValues: string[] };
  endpoints?: string[];
  knowledgeCutoff?: string;
  inputTokenPricingTiers?: InputTokenPricingTier[];
  /** @deprecated Read compatibility for catalogs generated before ordered tiers. */
  longContext?: InputTokenPricingTier;
  cachePolicy?: {
    writeMultiplier: number;
    readDiscount: number;
    minCacheLifeMin: number;
    explicitBreakpoints: boolean;
  };
}

export const MODEL_ENVIRONMENTS = ['e2b', 'local-runtime'] as const;
export type ModelEnvironment = (typeof MODEL_ENVIRONMENTS)[number];

/**
 * Runtime availability of a model's required execution environment. Mirrors
 * {@link ProviderHealthStatus}, env-availability is RUNTIME state ("is E2B
 * configured + reachable?"), NOT a static tier, so it must be threaded into the
 * pickers separately from the pure tier/access logic.
 */
export interface EnvironmentAvailability {
  configured: boolean;
  available?: boolean;
}

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
  provider: Provider | string;
  available: boolean;
  configured: boolean;
  error?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  healthCheckedAt?: number;
}

export interface ProviderPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface TokenMultiplier {
  prompt: number;
  completion: number;
}

export interface TaskRouting {
  fast_completion?: string;
  code_generation?: string;
  complex_reasoning?: string;
  chat?: string;
  vision?: string;
  long_context?: string;
}

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

export interface TierAllowedModels {
  economy: string[];
  pro_additions: string[];
  flagship_additions: string[];
}

export type ProviderCapabilityDefaults = Record<
  string,
  Partial<Record<ModelCapabilityName, string>>
>;

export interface ModelsCatalog {
  version: number | string;
  lastUpdated: string;
  providers: Record<string, ProviderConfig>;
  models: Record<string, ModelMetadata>;
  tierAllowedModels: TierAllowedModels;
  providerDefaults: ProviderCapabilityDefaults;
  providersInOrder: string[];
}

export function getProviderDefaultModelId(
  provider: string,
  capability: ModelCapabilityName,
): string | null {
  return modelsCatalog.providerDefaults?.[provider]?.[capability] ?? null;
}

type TierKey = keyof TierAllowedModels;

export interface PickerModelView {
  id: string;
  name: string;
  provider: Provider | string;
  contextWindow?: number;
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

/**
 * Every routing profile as its own tier, which is not the same list as
 * `getAutoRoutingProfiles`. That one answers "what may the model picker offer",
 * and the registry marks only the umbrella default selectable there. A surface
 * that asks the user to choose a tier directly, voice mode's Intelligence
 * picker, needs all three, so this reads the per-profile aliases instead.
 */
export function getAutoRoutingProfileTiers(): AutoRoutingProfileView[] {
  const policy = modelRegistry.policies.auto as unknown as {
    profileOrder: Array<AutoRoutingProfileView['profile']>;
    defaultAlias: string;
    aliases: Record<
      string,
      { profile: AutoRoutingProfileView['profile']; label: string; description: string }
    >;
  };

  return policy.profileOrder.map((profile) => {
    const entry = Object.entries(policy.aliases).find(
      ([id, alias]) => alias.profile === profile && id !== policy.defaultAlias,
    );
    if (!entry) {
      throw new Error(`Auto routing profile "${profile}" has no tier alias in the registry`);
    }
    const [id, alias] = entry;
    return {
      id: id as AutoModeModelId,
      profile,
      label: alias.label,
      description: alias.description,
    };
  });
}

export function getDefaultAutoRoutingProfile(): AutoRoutingProfileView {
  const policy = modelRegistry.policies.auto as unknown as { defaultAlias: string };
  const profile = getAutoRoutingProfiles().find(
    (candidate) => candidate.id === policy.defaultAlias,
  );
  if (!profile) {
    throw new Error(
      `Auto routing default "${policy.defaultAlias}" is not a selectable registry profile`,
    );
  }
  return profile;
}

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

export interface TierCapBehavior {
  warnAt: number;
  downgradeAt: number;
  hardCapAt: number;
}

export interface TierPolicy {
  tier: ProductTier;
  surfacedUx: TierSurfaceMode;
  allowedSlots: readonly RoutingSlot[];
  allowedProviderSurfaces: readonly ProviderSurface[];
  manualModelSelection: boolean;
  allowBrowserDom: boolean;
  allowComputerUse: boolean;
  allowSearch: boolean;
  allowMediaGeneration: boolean;

  allowManualSelection?: boolean;

  tokenCapPerMonth?: number | null;
  messagesPerDayCap?: number | null;
  capBehavior?: TierCapBehavior;

  allowImageGeneration?: boolean;
  allowVideoGeneration?: boolean;
  imageQuotaPerMonth?: number | null;
  imageSyntheticTokenCost?: number;

  allowToolUse?: boolean | string;
  allowMCP?: boolean | string;

  flagshipDailyTokenCap?: number;

  videoSecondsPerMonth?: number;

  usOnlyRoutingAvailable?: boolean;

  computerUseSoftCap?: number;
  computerUseHardCap?: number;

  allowDeepResearch?: boolean;

  allowVoice?: boolean;
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
    if ((model.status as string | undefined) === 'experimental') return false;
    return MANUAL_OVERRIDE_MODEL_TYPES.has(model.modelType);
  })
  .map(([id]) => id);
const MANUAL_OVERRIDE_MODEL_SET = new Set<string>(MANUAL_OVERRIDE_MODEL_IDS);

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
const STANDARD_CAP_BEHAVIOR: TierCapBehavior = Object.freeze({
  warnAt: 0.8,
  downgradeAt: 1.0,
  hardCapAt: 1.0,
});

const TIER_POLICIES_DEFINITION: Record<ProductTier, TierPolicy> = {
  free: {
    tier: 'free',
    surfacedUx: 'auto_only',
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
    voiceMinutesPerMonth: 30,
    tokenCapPerMonth: null,
    messagesPerDayCap: null,
  },
  pro: {
    tier: 'pro',
    surfacedUx: 'auto_plus_manual',
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
    allowVoice: true,
    voiceMinutesPerMonth: 300,
    allowVideoGeneration: false,
    imageQuotaPerMonth: null,
    imageSyntheticTokenCost: 50_000,
    allowToolUse: 'unlimited',
    allowMCP: 'unlimited',
    tokenCapPerMonth: 40_000_000,
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
    allowVoice: true,
    voiceMinutesPerMonth: null,
    usOnlyRoutingAvailable: true,
    videoSecondsPerMonth: 300,
    computerUseSoftCap: 1_000,
    computerUseHardCap: 2_500,
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
    allowVoice: true,
    voiceMinutesPerMonth: null,
    allowDeepResearch: true,
    allowToolUse: 'unlimited',
    allowMCP: 'unlimited',
    tokenCapPerMonth: null,
    capBehavior: STANDARD_CAP_BEHAVIOR,
  },
};

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

export const TIER_POLICIES = TIER_POLICIES_DEFINITION;

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

const TEXT_PRODUCING_MODEL_TYPES: ReadonlySet<ModelType> = new Set([
  'chat',
  'code',
  'reasoning',
  'multimodal',
  'search',
]);

/**
 * How long a single answer is allowed to get. This is a product decision, not a
 * model limit: every text model in the catalogue declares 64k or more, and
 * asking for all of it would size the pre-flight cost reservation against an
 * answer nobody writes. 8k covers the longest response the product composes -
 * a multi-thousand-word structured report - with room to spare.
 */
const ANSWER_TOKEN_CEILING = 8_192;

/** Used when the catalogue entry does not state the model's own limit. */
const UNDECLARED_OUTPUT_TOKENS = 4_096;

/** Non-text models keep a small budget; their output is not measured in tokens. */
const NON_TEXT_OUTPUT_TOKENS = 1_024;

/**
 * The output ceiling to send to the provider when the caller did not ask for
 * one. A fixed default truncates every long answer at the same point and makes
 * the reader chase it with Continue, which is where continuation seams come
 * from - so the number has to follow the model.
 */
export function resolveMaxOutputTokens(modelId: string | null | undefined): number {
  const metadata = getModelMetadataById(modelId);
  if (!metadata) return UNDECLARED_OUTPUT_TOKENS;
  if (!TEXT_PRODUCING_MODEL_TYPES.has(metadata.modelType)) return NON_TEXT_OUTPUT_TOKENS;

  const declared = metadata.maxOutputTokens ?? UNDECLARED_OUTPUT_TOKENS;
  const contextWindow = metadata.contextWindow;
  const withinContext =
    typeof contextWindow === 'number' && contextWindow > 0
      ? Math.min(declared, contextWindow)
      : declared;

  return Math.max(1, Math.min(ANSWER_TOKEN_CEILING, withinContext));
}

export const modelsById: Record<string, ModelMetadata> = (() => {
  const entries: Record<string, ModelMetadata> = {};

  for (const [modelId, metadata] of Object.entries(modelsCatalog.models)) {
    entries[modelId] = metadata;
  }

  for (const [alias, canonicalModelId] of Object.entries(modelIdAliases)) {
    const target = modelsCatalog.models[canonicalModelId];
    if (!target) continue;
    const existing = entries[alias];
    if (existing && !existing.deprecated) {
      continue;
    }
    entries[alias] = target;
  }

  return entries;
})();

(() => {
  for (const slot of Object.values(SLOT_REGISTRY)) {
    const meta = modelsById[slot.modelId];
    if (!meta) {
      throw new Error(
        `SLOT_REGISTRY references unknown model: ${slot.modelId} (slot: ${slot.slot}). ` +
          `Update model-registry curation or routing policy, then regenerate.`,
      );
    }
    if (slot.provider && meta.provider && slot.provider !== meta.provider) {
      throw new Error(
        `SLOT_REGISTRY slot "${slot.slot}" declares provider "${slot.provider}" but model ` +
          `"${slot.modelId}" belongs to provider "${meta.provider}" in models.json. ` +
          `Fix the slot's provider or modelId.`,
      );
    }
  }
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
    case 'max_15x':
    case 'max-15x':
    case 'max15x':
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

export type ModelFamilySlot = keyof typeof modelRegistry.families;

export interface ModelFamilySlotDefinition {
  slot: ModelFamilySlot;
  provider: string;
  canonicalFamily: string;
  tier: string;
  lifecyclePolicy: string;
  activeModelId: string;
  activeGeneration: string;
  activeLifecycle: string | null;
  previousModelId: string | null;
  fallbackChain: readonly string[];
  promotedAt: string | null;
  promotionReason: string | null;
}

type RegistryModelFamily = (typeof modelRegistry.families)[ModelFamilySlot];

export const MODEL_FAMILY_REGISTRY: Readonly<Record<ModelFamilySlot, ModelFamilySlotDefinition>> =
  Object.freeze(
    Object.fromEntries(
      (Object.entries(modelRegistry.families) as Array<[ModelFamilySlot, RegistryModelFamily]>).map(
        ([slot, family]): [ModelFamilySlot, ModelFamilySlotDefinition] => [
          slot,
          {
            slot,
            provider: family.provider,
            canonicalFamily: family.canonicalFamily,
            tier: family.tier,
            lifecyclePolicy: family.lifecyclePolicy,
            activeModelId: family.activeModelKey,
            activeGeneration: family.activeGeneration,
            activeLifecycle: family.activeLifecycle,
            previousModelId: family.previousModelKey,
            fallbackChain: Object.freeze([...family.fallbackChain]),
            promotedAt: family.promotedAt,
            promotionReason: family.promotionReason,
          },
        ],
      ),
    ) as Record<ModelFamilySlot, ModelFamilySlotDefinition>,
  );

export function isModelFamilySlot(slot: string): slot is ModelFamilySlot {
  return Object.prototype.hasOwnProperty.call(MODEL_FAMILY_REGISTRY, slot);
}

export function getModelFamilySlot(slot: ModelFamilySlot): ModelFamilySlotDefinition {
  return MODEL_FAMILY_REGISTRY[slot];
}

export function resolveModelFamilySlot(slot: ModelFamilySlot): string {
  return getModelFamilySlot(slot).activeModelId;
}

export function getModelFamilyFallbackChain(slot: ModelFamilySlot): readonly string[] {
  const family = getModelFamilySlot(slot);
  return Object.freeze([family.activeModelId, ...family.fallbackChain]);
}

const MODEL_TO_FAMILY_SLOT: ReadonlyMap<string, ModelFamilySlot> = new Map(
  Object.values(MODEL_FAMILY_REGISTRY).map((family) => [
    family.activeModelId,
    family.slot as ModelFamilySlot,
  ]),
);

export function getModelFamilySlotForModel(modelId: string): ModelFamilySlot | null {
  return MODEL_TO_FAMILY_SLOT.get(modelId) ?? null;
}

const MODEL_TO_FIRST_SLOT: ReadonlyMap<string, RoutingSlot> = (() => {
  const m = new Map<string, RoutingSlot>();
  for (const [slotKey, def] of Object.entries(SLOT_REGISTRY)) {
    if (!m.has(def.modelId)) {
      m.set(def.modelId, slotKey as RoutingSlot);
    }
  }
  return m;
})();

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
    case 'max_15x':
    case 'max-15x':
    case 'max15x':
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

export function getMinimumRequiredTier(modelId: string): 'basic' | 'pro' | 'max' | null {
  const canonicalModelId = normalizeModelId(modelId.toLowerCase());
  if (!canonicalModelId) return null;
  if (getAllowedModelsForTier('flagship_additions').includes(canonicalModelId)) return 'max';
  if (getAllowedModelsForTier('pro_additions').includes(canonicalModelId)) return 'pro';
  if (getAllowedModelsForTier('economy').includes(canonicalModelId)) return 'basic';
  return null;
}

export function canAccessModelForSubscriptionTier(
  modelId: string,
  subscriptionTier: string,
): boolean {
  const rawTier = typeof subscriptionTier === 'string' ? subscriptionTier.trim().toLowerCase() : '';
  const tier = normalizeSubscriptionAccessTier(subscriptionTier);

  const canonicalModelId = normalizeModelId(modelId.toLowerCase());
  if (!canonicalModelId) return false;

  if (tier === 'free') {
    if (rawTier !== 'free') return false;

    return (
      getAllowedModelsForTier('economy').includes(canonicalModelId) &&
      getModelMetadataById(canonicalModelId)?.tierPolicy?.minTier === 'free'
    );
  }

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

export function getModelAvailability(model: ModelMetadata): ModelAvailability {
  return model.availability ?? 'live';
}

export function isModelLive(model: ModelMetadata): boolean {
  return getModelAvailability(model) === 'live';
}

export type ExecutableImageModel = ModelMetadata & {
  modelType: 'image';
  imageApi: NonNullable<ModelMetadata['imageApi']>;
};

const GENERATED_IMAGE_MIME_TYPES = new Set<NonNullable<ModelMetadata['imageOutputMimeType']>>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function isExecutableImageModel(
  model: ModelMetadata | null | undefined,
): model is ExecutableImageModel {
  return Boolean(
    model &&
    model.modelType === 'image' &&
    model.capabilities?.imageGen === true &&
    model.deprecated !== true &&
    model.status !== 'deprecated' &&
    isModelLive(model) &&
    model.imageApi &&
    (model.imageApi !== 'gemini' ||
      (model.imageOutputMimeType && GENERATED_IMAGE_MIME_TYPES.has(model.imageOutputMimeType))),
  );
}

export type ExecutableVideoModel = ModelMetadata & {
  modelType: 'video';
};

export function isExecutableVideoModel(
  model: ModelMetadata | null | undefined,
): model is ExecutableVideoModel {
  return Boolean(
    model &&
    model.modelType === 'video' &&
    model.capabilities?.videoGen === true &&
    model.deprecated !== true &&
    model.status !== 'deprecated' &&
    isModelLive(model) &&
    ((model.videoGeneration?.durationSecs.length ?? 0) > 0 ||
      model.videoPerSecondCost !== undefined ||
      Object.keys(model.videoPerSecondCostByResolution ?? {}).length > 0),
  );
}

export interface VideoAspectOption {
  id: string;
  label: string;
}

export interface VideoQualityOption {
  id: string;
  label: string;
  durationSecs?: number[];
}

const VIDEO_ASPECT_ORDER = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
const VIDEO_QUALITY_ORDER = ['480p', '720p', '1080p', '4k'];

const VIDEO_ASPECT_LABELS: Record<string, string> = {
  '16:9': 'Landscape 16:9',
  '9:16': 'Portrait 9:16',
  '1:1': 'Square 1:1',
  '4:3': 'Classic 4:3',
  '3:4': 'Tall 3:4',
  '21:9': 'Cinematic 21:9',
};

const VIDEO_QUALITY_LABELS: Record<string, string> = {
  '480p': '480p',
  '720p': '720p',
  '1080p': '1080p',
  '4k': '4K',
};

function sortByKnownOrder(order: string[], values: string[]): string[] {
  return [...values].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
}

function videoOutputSizesFor(modelId?: string): VideoGenerationOutputSize[] {
  if (!modelId) return [];
  return getModelMetadataById(modelId)?.videoGeneration?.outputSizes ?? [];
}

export function getVideoAspectOptionsForModel(modelId?: string): VideoAspectOption[] {
  const unique = [...new Set(videoOutputSizesFor(modelId).map((size) => size.aspectRatio))];
  return sortByKnownOrder(VIDEO_ASPECT_ORDER, unique).map((id) => ({
    id,
    label: VIDEO_ASPECT_LABELS[id] ?? id,
  }));
}

export function getVideoQualityOptionsForModel(
  modelId?: string,
  aspectRatio?: string,
): VideoQualityOption[] {
  const sizes = videoOutputSizesFor(modelId);
  const matching = aspectRatio ? sizes.filter((size) => size.aspectRatio === aspectRatio) : sizes;
  const seen = new Map<string, VideoQualityOption>();
  for (const size of matching) {
    if (seen.has(size.resolution)) continue;
    seen.set(size.resolution, {
      id: size.resolution,
      label: VIDEO_QUALITY_LABELS[size.resolution] ?? size.resolution,
      ...(size.durationSecs ? { durationSecs: size.durationSecs } : {}),
    });
  }
  return sortByKnownOrder(VIDEO_QUALITY_ORDER, [...seen.keys()]).map((id) => seen.get(id)!);
}

export function isVideoOutputSupported(
  modelId: string | undefined,
  aspectRatio: string,
  resolution: string,
): boolean {
  return videoOutputSizesFor(modelId).some(
    (size) => size.aspectRatio === aspectRatio && size.resolution === resolution,
  );
}

export interface ImageAspectOption {
  id: string;
  label: string;
}

const IMAGE_ASPECT_RATIOS_BY_IMAGE_API: Record<
  NonNullable<ModelMetadata['imageApi']>,
  readonly string[]
> = {
  gemini: [
    '1:1',
    '1:4',
    '1:8',
    '2:3',
    '3:2',
    '3:4',
    '4:1',
    '4:3',
    '4:5',
    '5:4',
    '8:1',
    '9:16',
    '16:9',
    '21:9',
  ],
  imagen: ['1:1', '3:4', '4:3', '9:16', '16:9'],
  openai: ['1:1', '2:3', '3:2'],
  stability: ['1:1', '2:3', '3:2', '4:5', '5:4', '9:16', '16:9', '21:9', '9:21'],
};

const IMAGE_ASPECT_ORDER = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
  '9:21',
  '4:1',
  '1:4',
  '8:1',
  '1:8',
];

const IMAGE_ASPECT_LABELS: Record<string, string> = {
  '1:1': 'Square 1:1',
  '16:9': 'Landscape 16:9',
  '9:16': 'Portrait 9:16',
  '4:3': 'Classic 4:3',
  '3:4': 'Tall 3:4',
  '3:2': 'Photo 3:2',
  '2:3': 'Portrait 2:3',
  '5:4': 'Wide 5:4',
  '4:5': 'Social 4:5',
  '21:9': 'Cinematic 21:9',
  '9:21': 'Tall 9:21',
  '4:1': 'Banner 4:1',
  '1:4': 'Column 1:4',
  '8:1': 'Ultra-wide 8:1',
  '1:8': 'Ultra-tall 1:8',
};

export function getImageAspectOptionsForModel(modelId?: string): ImageAspectOption[] {
  if (!modelId) return [];
  const imageApi = getModelMetadataById(modelId)?.imageApi;
  if (!imageApi) return [];
  const supported = IMAGE_ASPECT_RATIOS_BY_IMAGE_API[imageApi] ?? [];
  return sortByKnownOrder(IMAGE_ASPECT_ORDER, [...supported]).map((id) => ({
    id,
    label: IMAGE_ASPECT_LABELS[id] ?? id,
  }));
}

export function isImageAspectSupported(modelId: string | undefined, aspectRatio: string): boolean {
  return getImageAspectOptionsForModel(modelId).some((option) => option.id === aspectRatio);
}

export function resolveVideoGenerationOutputSize(
  model: Pick<ModelMetadata, 'videoGeneration'>,
  resolution: string,
  aspectRatio: string,
): VideoGenerationOutputSize | null {
  return (
    model.videoGeneration?.outputSizes.find(
      (candidate) => candidate.resolution === resolution && candidate.aspectRatio === aspectRatio,
    ) ?? null
  );
}

export function calculateCatalogVideoCostCents(input: {
  model: Pick<ModelMetadata, 'videoGeneration'>;
  resolution: string;
  aspectRatio: string;
  durationSecs: number;
  generateAudio: boolean;
}): number | null {
  const video = input.model.videoGeneration;
  const formula = video?.pricing;
  const output = resolveVideoGenerationOutputSize(input.model, input.resolution, input.aspectRatio);
  if (
    !video ||
    !formula ||
    !output ||
    !video.durationSecs.includes(input.durationSecs) ||
    (input.generateAudio && !video.supportsAudio)
  ) {
    return null;
  }
  const usdPerToken = input.generateAudio
    ? formula.usdPerToken
    : (formula.usdPerTokenWithoutAudio ?? formula.usdPerToken);
  const values = [
    output.width,
    output.height,
    input.durationSecs,
    formula.framesPerSecond,
    formula.pixelsPerToken,
    usdPerToken,
  ];
  if (
    !values.every((value) => Number.isFinite(value) && value > 0) ||
    !Number.isInteger(output.width) ||
    !Number.isInteger(output.height) ||
    !Number.isInteger(formula.framesPerSecond) ||
    !Number.isInteger(formula.pixelsPerToken)
  ) {
    return null;
  }
  const videoTokens =
    (output.width * output.height * input.durationSecs * formula.framesPerSecond) /
    formula.pixelsPerToken;
  return Math.ceil(Number((videoTokens * usdPerToken * 100).toFixed(8)));
}

export function getModelReasoning(modelId: string | null | undefined): ModelReasoning {
  const meta = getModelMetadataById(modelId);
  return meta?.reasoning ?? { capable: false, control: 'none' };
}

export function getModelEffortOptions(modelId: string | null | undefined): readonly Effort[] {
  const reasoning = getModelReasoning(modelId);
  const request = reasoning.request;
  if (!request?.effortPath && !request?.responsesEffortPath) return [];
  return reasoning.supportedEfforts ?? [];
}

const EFFORT_LADDER: readonly Effort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export interface EffortEntitlement {
  allowed: Effort[];
  gated: Effort[];
  cap?: Effort;
}

/**
 * Reasoning effort above a model's default is the same compute escalation that
 * `manualModelSelection` already gates, so tiers without it stay at the default.
 */
export function splitEffortsByEntitlement(
  reasoning: ModelReasoning,
  tier: string | null | undefined,
): EffortEntitlement {
  const supported = reasoning.supportedEfforts ?? [];
  const ungated: EffortEntitlement = { allowed: [...supported], gated: [] };
  if (supported.length === 0 || canAccessManualModelSelection(tier)) return ungated;

  const cap = reasoning.defaultEffort;
  if (!cap) return ungated;
  const capRank = EFFORT_LADDER.indexOf(cap);
  if (capRank < 0) return ungated;

  const allowed = supported.filter((effort) => EFFORT_LADDER.indexOf(effort) <= capRank);
  const gated = supported.filter((effort) => EFFORT_LADDER.indexOf(effort) > capRank);
  if (allowed.length === 0) return ungated;
  return { allowed, gated, cap };
}

export function clampEffortToEntitlement(
  modelId: string | null | undefined,
  requested: Effort | undefined,
  tier: string | null | undefined,
): Effort | undefined {
  if (!requested) return requested;
  const { allowed, cap } = splitEffortsByEntitlement(getModelReasoning(modelId), tier);
  if (allowed.length === 0 || allowed.includes(requested)) return requested;
  return cap ?? allowed[allowed.length - 1];
}

export interface ReasoningDepthIndicator {
  filled: number;
  scale: number;
}

const reasoningDotsScale = (() => {
  let max = 0;
  for (const metadata of Object.values(modelsCatalog.models)) {
    const dots = metadata.reasoningDots;
    if (typeof dots === 'number' && Number.isFinite(dots) && dots > max) max = Math.floor(dots);
  }
  return max;
})();

export function getReasoningDepthIndicator(
  modelId: string | null | undefined,
): ReasoningDepthIndicator | null {
  if (reasoningDotsScale <= 0) return null;
  const dots = getModelMetadataById(modelId)?.reasoningDots;
  if (typeof dots !== 'number' || !Number.isFinite(dots) || dots <= 0) return null;
  return { filled: Math.min(Math.floor(dots), reasoningDotsScale), scale: reasoningDotsScale };
}

export function resolveModelEffort(
  modelId: string | null | undefined,
  requested: string | null | undefined,
): Effort | undefined {
  const options = getModelEffortOptions(modelId);
  if (requested && options.includes(requested as Effort)) return requested as Effort;
  const defaultEffort = getModelReasoning(modelId).defaultEffort;
  if (defaultEffort && options.includes(defaultEffort)) return defaultEffort;
  return options[0];
}

export function getDisplayModels(): ModelMetadata[] {
  return getManualOverrideModels();
}

export function getSelectableModels(): ModelMetadata[] {
  return getDisplayModels().filter(isModelLive);
}

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

export function getProviderModelCatalog(provider: Provider | string): readonly ModelInfo[] {
  return getIndexedModelsForProvider(provider).map((meta) => {
    return {
      id: meta.id,
      ...(meta.name !== undefined ? { name: meta.name } : {}),
      provider: meta.provider,
      ...(meta.modelType !== undefined ? { modelType: meta.modelType } : {}),
      ...(meta.contextWindow !== undefined ? { contextWindow: meta.contextWindow } : {}),
      ...(meta.maxOutputTokens !== undefined ? { maxOutputTokens: meta.maxOutputTokens } : {}),
      ...(meta.capabilities ? { capabilities: meta.capabilities } : {}),
      ...(meta.inputCost !== undefined ? { inputCostPerMillion: meta.inputCost } : {}),
      ...(meta.outputCost !== undefined ? { outputCostPerMillion: meta.outputCost } : {}),
    } satisfies ModelInfo;
  });
}

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
        (right.contextWindow ?? 0) - (left.contextWindow ?? 0) ||
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
      description: `${providerLabel}, ${describeQualityBand(model)}`,
      detail: formatCoreModelDetail(model),
    };
  });
}

export const NON_US_PROVIDERS: ReadonlySet<string> = Object.freeze(
  new Set<string>(modelRegistry.policies.auto.providerPolicies.usOnly.excludedProviders),
);

/**
 * Kinds of "default model" requests `getDefaultModelFor` understands.
 *
 * Each kind maps to a tier-aware `RoutingSlot` lookup using the same
 * `TIER_POLICIES` registry the auto-router consults. Use this helper instead
 * of hardcoding concrete model IDs at call sites.
 *
 */
export type DefaultModelKind = 'chat' | 'fast-status' | 'voice' | 'computer-use' | 'reasoning';

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

  // Final safety net, every tier in TIER_POLICIES allows workhorse_general,
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
      ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
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
    if (!metadata || metadata.contextWindow === undefined) {
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
