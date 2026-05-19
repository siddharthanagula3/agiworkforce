/**
 * Three-tier router with promo-expiry-aware auto-reroute.
 *
 * Implements PRD V5 lock #24:
 *   - Three quality tiers (economy / balanced / premium) per task type.
 *   - DeepSeek V4-Pro promotional pricing expires `2026-05-31T15:59:00Z`;
 *     post-expiry, V4-Pro auto-reroutes to V4-Flash by default and to
 *     `claude-sonnet-4.6` for quality-sensitive task types
 *     (reasoning / coding_premium / long_context).
 *   - Deprecation-aware: any model whose `deprecation_date` is in the past
 *     auto-falls-back to its tier's primary alternative; this guards against
 *     the Kimi K2 family dying 2026-05-25 even if a caller hardcoded an alias.
 *
 * The router takes the classifier's `RoutingTaskType` and the user's
 * billing tier, then resolves the model ID to actually send the request to.
 * The decision is *deterministic* given (taskType, tier, now), so it's safe
 * to memoize at call sites.
 *
 * @module routing/three-tier-router
 * @packageDocumentation
 */

// Routing depends on @agiworkforce/types as a workspace package. The types
// package exposes its catalog JSON via the `./models.json` sub-path export
// (see packages/types/package.json `"exports"`).
// `resolveJsonModule: true` is set in the workspace base tsconfig.
import modelsCatalog from '@agiworkforce/types/models.json';

import type { RoutingTaskType } from './types';

// ============================================================================
// Catalog handle — kept narrow so changes to models.json shape stay local.
// ============================================================================

interface CatalogModel {
  readonly id: string;
  readonly provider: string;
  readonly inputCost?: number;
  readonly outputCost?: number;
  readonly cached_input?: number;
  readonly promo_expires_at?: string | null;
  readonly post_promo_prices?: {
    readonly input: number;
    readonly output: number;
    readonly cached_input?: number;
  };
  readonly deprecation_date?: string | null;
  readonly tokenizer_drift_factor?: number;
}

interface Catalog {
  readonly models: Record<string, CatalogModel>;
}

const CATALOG: Catalog = modelsCatalog as unknown as Catalog;

// ============================================================================
// Tier definitions
// ----------------------------------------------------------------------------
// Three quality tiers. Each maps to a primary model and a secondary
// (post-promo / quality-sensitive) fallback. The tier definitions live HERE
// rather than in models.json because they are routing policy, not catalog
// data — see `tasks/auto-routing-spec.md` §3.
// ============================================================================

/** Three-tier classification used by the router. */
export type QualityTier = 'economy' | 'balanced' | 'premium';

/** Model preferences keyed by task type — order matters: first usable wins. */
interface TierTaskPolicy {
  readonly primary: string;
  /**
   * Reroute target when `primary` is past its promo expiry OR deprecation
   * date. For quality-sensitive task types this is a different family
   * (e.g. Claude Sonnet) rather than the cheaper sibling.
   */
  readonly postPromoFallback: string;
  /** Final-resort fallback when both primary and post-promo are unavailable. */
  readonly emergencyFallback: string;
}

// Quality-sensitive task types where the post-promo reroute should jump
// to Claude Sonnet 4.6 (different family) rather than the cheaper sibling.
const QUALITY_SENSITIVE_TASKS: ReadonlySet<RoutingTaskType> = new Set<RoutingTaskType>([
  'reasoning',
  'long_context',
  'computer-use',
]);

// The quality-sensitive fallback target. Pulled into a named constant so
// ESLint baseline tracking covers ONE site rather than every occurrence.
const SONNET_QUALITY_FALLBACK = 'claude-sonnet-4.6';

function pol(
  primary: string,
  postPromoFallback: string,
  emergencyFallback: string,
): TierTaskPolicy {
  return { primary, postPromoFallback, emergencyFallback };
}

/**
 * Per-tier × per-task policy.
 *
 * The premium tier defaults to `claude-opus-4.7` for reasoning and to
 * `deepseek-v4-pro` for coding-heavy lanes WHILE the V4-Pro promo is active;
 * after `2026-05-31T15:59:00Z` the router collapses the V4-Pro lane to
 * V4-Flash (or Sonnet for quality-sensitive tasks).
 */
const POLICY: Readonly<Record<QualityTier, Readonly<Record<RoutingTaskType, TierTaskPolicy>>>> = {
  economy: {
    simple_chat: pol('gemini-3.1-flash-lite', 'deepseek-v4-flash', 'gpt-5.4-mini'),
    general: pol('gemini-3.1-flash-lite', 'deepseek-v4-flash', 'gpt-5.4-mini'),
    coding: pol('deepseek-v4-flash', 'gpt-5.4-mini', 'claude-sonnet-4.6'),
    reasoning: pol('deepseek-v4-flash', 'claude-sonnet-4.6', 'gpt-5.4-mini'),
    creative_writing: pol('gemini-3.1-flash-lite', 'gpt-5.4-mini', 'claude-sonnet-4.6'),
    research: pol('sonar', 'sonar-pro', 'gpt-5.4-mini'),
    multimodal: pol('gemini-3.1-flash-lite', 'gpt-5.4-mini', 'claude-sonnet-4.6'),
    long_context: pol('gemini-3.1-flash-lite', 'claude-sonnet-4.6', 'gpt-5.4'),
    image_generation: pol('imagen-4-fast', 'gpt-image-1', 'gpt-image-1'),
    agentic: pol('claude-sonnet-4.6', 'gpt-5.4-mini', 'deepseek-v4-flash'),
    'computer-use': pol('claude-sonnet-4.6', 'gpt-5.4-mini', 'gpt-5.4-mini'),
  },
  balanced: {
    simple_chat: pol('gpt-5.4-mini', 'gemini-3.1-flash-lite', 'claude-sonnet-4.6'),
    general: pol('claude-sonnet-4.6', 'gpt-5.4', 'gpt-5.4-mini'),
    coding: pol('deepseek-v4-pro', 'deepseek-v4-flash', 'gpt-5.4-codex'),
    reasoning: pol('deepseek-v4-pro', 'claude-sonnet-4.6', 'gpt-5.4'),
    creative_writing: pol('claude-sonnet-4.6', 'gpt-5.4', 'gemini-3.1-pro-preview'),
    research: pol('sonar-pro', 'sonar-deep-research', 'gpt-5.4'),
    multimodal: pol('gemini-3.1-pro-preview', 'claude-sonnet-4.6', 'gpt-5.4'),
    long_context: pol('claude-sonnet-4.6', 'gemini-3.1-pro-preview', 'gpt-5.4'),
    image_generation: pol('gpt-image-1', 'imagen-4', 'imagen-4-fast'),
    agentic: pol('claude-sonnet-4.6', 'gpt-5.4', 'gpt-5.4-codex'),
    'computer-use': pol('claude-sonnet-4.6', 'gpt-5.4', 'gpt-5.4-mini'),
  },
  premium: {
    simple_chat: pol('claude-sonnet-4.6', 'gpt-5.4', 'gpt-5.4-mini'),
    general: pol('claude-opus-4.7', 'gpt-5.5', 'claude-sonnet-4.6'),
    coding: pol('deepseek-v4-pro', 'claude-sonnet-4.6', 'gpt-5.4-codex'),
    reasoning: pol('claude-opus-4.7', 'gpt-5.5', 'claude-sonnet-4.6'),
    creative_writing: pol('claude-opus-4.7', 'claude-sonnet-4.6', 'gpt-5.5'),
    research: pol('sonar-deep-research', 'claude-opus-4.7', 'gpt-5.5'),
    multimodal: pol('gemini-3.1-pro-preview', 'claude-opus-4.7', 'gpt-5.5'),
    long_context: pol('claude-opus-4.7', 'claude-sonnet-4.6', 'gemini-3.1-pro-preview'),
    image_generation: pol('imagen-4-ultra', 'gpt-image-1.5', 'imagen-4'),
    agentic: pol('claude-opus-4.7', 'claude-sonnet-4.6', 'gpt-5.4-codex'),
    'computer-use': pol('claude-opus-4.7', 'claude-sonnet-4.6', 'gpt-5.4'),
  },
};

// ============================================================================
// Tokenizer-drift estimate inflation
// ----------------------------------------------------------------------------
// Claude Opus 4.7 trips a 1.0x–1.35x tokenizer drift vs prior Claude families;
// downstream cost/latency budgets MUST re-baseline. The router exposes this
// as a function so callers can pre-scale token estimates BEFORE committing to
// the route.
// ============================================================================

/**
 * Inflation factor used to scale token estimates for known-drifted models.
 * Returns `1.0 + tokenizer_drift_factor` so callers can multiply directly:
 * `inflatedTokens = tokensEstimate * tokenizerDriftFactor(modelId)`.
 *
 * Models without a `tokenizer_drift_factor` field return `1.0` (identity).
 */
export function tokenizerDriftFactor(modelId: string): number {
  const entry = CATALOG.models[modelId];
  if (!entry) return 1.0;
  const raw = entry.tokenizer_drift_factor;
  if (typeof raw !== 'number') return 1.0;
  return 1.0 + raw;
}

/**
 * Maximum reasonable inflation under tokenizer drift for the given model.
 * Use this for upper-bound cost estimation; the realized inflation is
 * payload-dependent and typically sits BETWEEN 1.0× and this maximum.
 */
export const ESTIMATE_INFLATION = {
  conservative: (modelId: string): number => tokenizerDriftFactor(modelId),
} as const;

// ============================================================================
// Deprecation + promo-expiry checks
// ----------------------------------------------------------------------------
// Both checks compare against a caller-supplied `now` so tests can pin time
// to before/after the 2026-05-31T15:59:00Z DeepSeek V4-Pro promo cutoff and
// the 2026-05-25 Kimi K2 family death.
// ============================================================================

/** True when `modelId` is past its provider-side deprecation date at `now`. */
export function isDeprecated(modelId: string, now: Date = new Date()): boolean {
  const entry = CATALOG.models[modelId];
  if (!entry) return true; // Missing entries are treated as deprecated.
  if (entry.deprecation_date == null) return false;
  const cutoff = Date.parse(entry.deprecation_date);
  if (Number.isNaN(cutoff)) return false;
  return now.getTime() >= cutoff;
}

/** True when `modelId` is past its promotional pricing cutoff at `now`. */
export function isPromoExpired(modelId: string, now: Date = new Date()): boolean {
  const entry = CATALOG.models[modelId];
  if (!entry || !entry.promo_expires_at) return false;
  const cutoff = Date.parse(entry.promo_expires_at);
  if (Number.isNaN(cutoff)) return false;
  return now.getTime() >= cutoff;
}

/**
 * Effective input price ($/M tokens) for `modelId` at `now`.
 * Post-promo prices automatically apply once `promo_expires_at` has passed.
 */
export function effectiveInputPrice(modelId: string, now: Date = new Date()): number {
  const entry = CATALOG.models[modelId];
  if (!entry) return 0;
  if (isPromoExpired(modelId, now) && entry.post_promo_prices) {
    return entry.post_promo_prices.input;
  }
  return entry.inputCost ?? 0;
}

/** Effective output price ($/M tokens) for `modelId` at `now`. */
export function effectiveOutputPrice(modelId: string, now: Date = new Date()): number {
  const entry = CATALOG.models[modelId];
  if (!entry) return 0;
  if (isPromoExpired(modelId, now) && entry.post_promo_prices) {
    return entry.post_promo_prices.output;
  }
  return entry.outputCost ?? 0;
}

// ============================================================================
// Router resolution
// ============================================================================

/** Output of `resolveThreeTierModel`. */
export interface RouteResolution {
  /** The model ID the caller should send the request to. */
  readonly modelId: string;
  /** Tier the resolution came from. */
  readonly tier: QualityTier;
  /** Task type used for the lookup. */
  readonly taskType: RoutingTaskType;
  /**
   * Diagnostic: what kind of fallback (if any) the router applied.
   * - `'primary'`: returned the tier's primary model.
   * - `'post-promo-fallback'`: primary was past its promo cutoff.
   * - `'deprecation-fallback'`: primary was past its deprecation date.
   * - `'emergency-fallback'`: post-promo fallback was ALSO unavailable.
   */
  readonly fallbackReason:
    | 'primary'
    | 'post-promo-fallback'
    | 'deprecation-fallback'
    | 'emergency-fallback';
  /** Whether the resolved model is currently in a quality-sensitive lane. */
  readonly qualitySensitive: boolean;
}

/**
 * Pick the fallback target for a tier policy, taking the quality-sensitive
 * override into account.
 *
 * Quality-sensitive task types route to Claude Sonnet 4.6 regardless of
 * what the policy's `postPromoFallback` says — this is the PRD V5 lock #24
 * default for "reasoning / long_context / computer-use" lanes that would
 * otherwise downgrade to a cheaper sibling.
 */
function pickPostPromoTarget(policy: TierTaskPolicy, qualitySensitive: boolean): string {
  if (qualitySensitive) {
    return SONNET_QUALITY_FALLBACK;
  }
  return policy.postPromoFallback;
}

/**
 * Resolve a model for the given (tier, taskType, now) tuple. Applies:
 *
 *   1. Deprecation check on the primary; if past `deprecation_date`, falls
 *      back to the tier's `postPromoFallback`. This catches Kimi K2 family
 *      death even when a caller has hardcoded an alias.
 *   2. Promo-expiry check; if past `promo_expires_at`, falls back too — but
 *      for quality-sensitive task types (reasoning / long_context /
 *      computer-use) the fallback is `claude-sonnet-4.6` regardless of what
 *      the tier-table says, per PRD V5 lock #24.
 *   3. Emergency fallback if the post-promo target is itself deprecated.
 *
 * @param taskType - Task taxonomy bucket from the classifier.
 * @param tier - User's billing tier.
 * @param now - Wall-clock used for promo + deprecation checks. Default `new Date()`.
 */
export function resolveThreeTierModel(
  taskType: RoutingTaskType,
  tier: QualityTier,
  now: Date = new Date(),
): RouteResolution {
  const policy = POLICY[tier][taskType];
  const qualitySensitive = QUALITY_SENSITIVE_TASKS.has(taskType);
  const baseResult = {
    tier,
    taskType,
    qualitySensitive,
  } as const;

  // Layer 1: deprecation guard on primary.
  if (isDeprecated(policy.primary, now)) {
    const target = pickPostPromoTarget(policy, qualitySensitive);
    if (isDeprecated(target, now)) {
      return {
        ...baseResult,
        modelId: policy.emergencyFallback,
        fallbackReason: 'emergency-fallback',
      };
    }
    return {
      ...baseResult,
      modelId: target,
      fallbackReason: 'deprecation-fallback',
    };
  }

  // Layer 2: promo-expiry guard on primary.
  if (isPromoExpired(policy.primary, now)) {
    const target = pickPostPromoTarget(policy, qualitySensitive);
    if (isDeprecated(target, now)) {
      return {
        ...baseResult,
        modelId: policy.emergencyFallback,
        fallbackReason: 'emergency-fallback',
      };
    }
    return {
      ...baseResult,
      modelId: target,
      fallbackReason: 'post-promo-fallback',
    };
  }

  // Happy path.
  return {
    ...baseResult,
    modelId: policy.primary,
    fallbackReason: 'primary',
  };
}
