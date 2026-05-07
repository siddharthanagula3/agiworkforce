/**
 * assert-quota.ts
 *
 * Per-request quota helper for the AGI Workforce web API.
 *
 * Design constraints (per tasks/auto-routing-spec.md §1, §3 and Vercel rules):
 *
 *   server-no-shared-module-state:
 *     Both exported functions are pure async functions with no module-level
 *     mutable state. Every variable is request-scoped. The TIER_POLICIES
 *     registry imported from @agiworkforce/types is frozen at module load and
 *     never mutated here.
 *
 *   server-cache-react:
 *     `cache()` wraps `_fetchUsageRow` so that multiple quota checks within
 *     the same React request dedup to a single DB round-trip (e.g. token cap
 *     check + image sub-quota check both issued from the same POST handler).
 *
 *   async-cheap-condition-before-await:
 *     Tier is read from the JWT-parsed parameter (no DB hit) before any
 *     await. An early-exit for missing tokenCapPerMonth avoids unnecessary
 *     I/O for tiers without monthly limits (BYOK, Local).
 *
 *   async-parallel:
 *     Sub-quota checks (token + image + video + CU + mcp) run in Promise.all
 *     when the caller requests multiple feature checks.
 *
 *   server-dedup-props:
 *     Only userId, token, and tier are accepted. The full user/subscription
 *     objects are never passed in.
 *
 *   js-early-exit:
 *     Returns 'ok' immediately when pctUsed < warnAt without further work.
 *
 * Role-correctness (WEB-RLS-BYPASS audit requirement):
 *   - Tier: read from JWT claim parameter — zero DB hits.
 *   - Usage read: getUserClient(token) — RLS-bound, user can only see own rows.
 *   - Usage increment: SECURITY DEFINER RPC `increment_usage` — atomic, no
 *     direct UPDATE with service_role.
 *
 * DO NOT add this logic to proxy.ts or middleware.ts.
 */

import 'server-only';

import { cache } from 'react';
import { getTierPolicy, getRoutingSlotModel } from '@agiworkforce/types';
import type { ProductTier, TierPolicy, TierCapBehavior, RoutingSlot } from '@agiworkforce/types';
import { getUserClient } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Possible outcomes from assertQuota.
 *
 * 'ok'         — user is within limits, proceed normally.
 * 'warn'       — approaching cap (pctUsed >= warnAt); continue but surface warning.
 * 'downgrade'  — at or over nominal cap (pctUsed >= downgradeAt); force workhorse model.
 * 'paywall'    — hard cap exceeded (pctUsed >= hardCapAt); refuse request.
 */
export type QuotaOutcome =
  | { kind: 'ok' }
  | { kind: 'warn'; warning: string; pctUsed: number }
  | { kind: 'downgrade'; modelOverride: string; reason: string }
  | { kind: 'paywall'; feature: string; requiredTier: string; reason: string };

/**
 * Sub-feature names that have independent caps.
 * 'chat' is the default general token-bucket feature (used by reconcileUsage
 * when no specific sub-feature applies).
 */
export type QuotaFeature = 'chat' | 'image' | 'video' | 'computer_use' | 'mcp';

export interface AssertQuotaOptions {
  userId: string;
  /** User's JWT access token — passed to getUserClient, never logged. */
  token: string;
  /** Subscription tier parsed from the JWT claim — no DB hit required. */
  tier: ProductTier | string;
  /** Pre-flight token count estimate for the upcoming request. */
  requestedTokens: number;
  /** Optional sub-feature to gate additionally. */
  feature?: QuotaFeature;
  /**
   * Routing slot the request will use. When this is a Pro+ flagship slot
   * (`flagship_*_pro_plus`) and the tier policy specifies
   * `flagshipDailyTokenCap`, assertQuota also enforces the daily cap and
   * returns a downgrade outcome that points back to the equivalent
   * non-flagship Pro slot when the daily cap is exhausted.
   */
  slot?: RoutingSlot;
}

export interface ReconcileUsageOptions {
  userId: string;
  token: string;
  /** Actual tokens consumed, from the model's usage metadata. */
  actualTokens: number;
  feature?: QuotaFeature;
  /**
   * Whether the request was routed to a flagship Pro+ slot. When true the
   * RPC also increments `flagship_daily_tokens` (with 24h lazy reset) so
   * subsequent assertQuota calls can enforce `flagshipDailyTokenCap`.
   */
  isFlagship?: boolean;
}

// ---------------------------------------------------------------------------
// Internal: the workhorse model to fall back to when pctUsed >= downgradeAt.
// Source: auto-routing-spec.md §2 Pool B workhorse slot.
// Model IDs are read from SLOT_REGISTRY at runtime in production code, but
// for the quota helper the constant lives here to avoid a circular dep on
// resolveAutoModeModel. Update this if Pool B workhorse changes.
// ---------------------------------------------------------------------------
const DOWNGRADE_MODEL_OVERRIDE = 'gemini-3.1-flash-lite';

// ---------------------------------------------------------------------------
// Flagship → non-flagship downgrade map (Pro+ daily-cap enforcement).
//
// When a Pro+ user blows past `flagshipDailyTokenCap`, the request is routed
// to the equivalent Pro-pool slot rather than all the way down to the Hobby
// workhorse. This preserves Pro-tier quality of service while protecting the
// flagship-COGS budget. The slot identifiers and their canonical models are
// resolved through SLOT_REGISTRY so we never hardcode model IDs here.
// ---------------------------------------------------------------------------
const FLAGSHIP_TO_PRO_SLOT: Readonly<Record<string, RoutingSlot>> = Object.freeze({
  flagship_coding_pro_plus: 'coding_premium_pro',
  flagship_general_pro_plus: 'general_balanced_pro',
});

function isFlagshipSlot(slot: RoutingSlot | undefined): boolean {
  if (!slot) return false;
  return Object.prototype.hasOwnProperty.call(FLAGSHIP_TO_PRO_SLOT, slot);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Determine the "next tier up" for a given tier, used in paywall messaging.
 */
function nextTierUp(tier: ProductTier | string): string {
  switch ((tier ?? '').toLowerCase()) {
    case 'free':
      return 'hobby';
    case 'hobby':
      return 'pro';
    case 'pro':
      return 'pro_plus';
    default:
      return 'enterprise';
  }
}

/**
 * Fetch the current-period usage row for the user.
 *
 * Wrapped with `cache()` (Vercel rule: server-cache-react) so multiple
 * assertQuota calls within the same React render request share a single
 * round-trip to the database. The cache key is the composed userId+token
 * string — token uniquely identifies the user's auth context.
 *
 * Returns null if no active credit row exists (treated as 0 usage).
 *
 * Role-correctness: uses getUserClient(token) so RLS is fully enforced.
 * The user can only read their own row.
 */
const _fetchUsageRow = cache(
  async (
    userId: string,
    token: string,
  ): Promise<{
    credits_used_cents: number;
    credits_allocated_cents: number;
    daily_used_cents: number | null;
    flagship_daily_tokens: number | null;
    flagship_daily_reset_at: string | null;
  } | null> => {
    const userClient = getUserClient(token);
    // Cast through unknown because generated supabase types may not yet
    // include the flagship_daily_* columns added by the
    // 20260508120000_flagship_daily_cap_tracking.sql migration.
    const builder = userClient.from('token_credits') as unknown as {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          gt: (
            col: string,
            val: string,
          ) => {
            order: (
              col: string,
              opts: { ascending: boolean },
            ) => {
              limit: (n: number) => {
                maybeSingle: () => Promise<{
                  data: {
                    credits_used_cents: number;
                    credits_allocated_cents: number;
                    daily_used_cents: number | null;
                    flagship_daily_tokens: number | null;
                    flagship_daily_reset_at: string | null;
                  } | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };

    const { data, error } = await builder
      .select(
        'credits_used_cents, credits_allocated_cents, daily_used_cents, flagship_daily_tokens, flagship_daily_reset_at',
      )
      .eq('user_id', userId)
      .gt('period_end', new Date().toISOString())
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn(
        { userId, error: error.message },
        '[assertQuota] Failed to fetch usage row — treating as 0 used',
      );
      return null;
    }

    return data ?? null;
  },
);

/**
 * Evaluate a single pctUsed value against a TierCapBehavior spec.
 *
 * Vercel rule applied: js-early-exit — returns 'ok' immediately when below
 * warnAt without touching the remaining branches.
 */
function evaluateCapBehavior(
  pctUsed: number,
  capBehavior: TierCapBehavior,
  tier: ProductTier | string,
  featureName: string,
): QuotaOutcome {
  const { warnAt, downgradeAt, hardCapAt } = capBehavior;

  // js-early-exit: cheapest path first
  if (pctUsed < warnAt) {
    return { kind: 'ok' };
  }

  if (pctUsed >= hardCapAt) {
    return {
      kind: 'paywall',
      feature: featureName,
      requiredTier: nextTierUp(tier),
      reason: `Monthly ${featureName} cap exceeded (${Math.round(pctUsed * 100)}% used). Upgrade to ${nextTierUp(tier)} for a higher limit.`,
    };
  }

  if (pctUsed >= downgradeAt) {
    return {
      kind: 'downgrade',
      modelOverride: DOWNGRADE_MODEL_OVERRIDE,
      reason: `${featureName} cap reached (${Math.round(pctUsed * 100)}% used). Routing to workhorse model to preserve service.`,
    };
  }

  // pctUsed is between warnAt and downgradeAt
  return {
    kind: 'warn',
    warning: `Approaching ${featureName} monthly cap (${Math.round(pctUsed * 100)}% used).`,
    pctUsed,
  };
}

// ---------------------------------------------------------------------------
// Image sub-quota helper
// ---------------------------------------------------------------------------

/**
 * Fetch image generation usage for current period.
 *
 * The spec defines image quota in terms of a separate `imageQuotaPerMonth`
 * counter. We derive it from credits used weighted by imageSyntheticTokenCost.
 * In the absence of a dedicated image_usage column, we approximate by
 * counting how many image synthetic token slots were consumed from the credit
 * budget. This is a conservative estimate; a future migration can add a
 * dedicated counter.
 *
 * Wrapped with `cache()` to dedup within a single request.
 */
const _fetchImageUsageCount = cache(async (userId: string, token: string): Promise<number> => {
  const userClient = getUserClient(token);
  // Count image generation records for the current billing period.
  // Uses the `media_generations` table (if available) with RLS enforced.
  // Falls back to 0 on any error so we don't incorrectly gate the user.
  try {
    // Cast to `unknown` first to escape the generated types which don't
    // include the `media_generations` table yet.
    const builder = (
      userClient as unknown as {
        from: (table: string) => {
          select: (
            cols: string,
            opts: { count: string; head: boolean },
          ) => {
            eq: (
              col: string,
              val: string,
            ) => {
              eq: (
                col: string,
                val: string,
              ) => {
                gte: (
                  col: string,
                  val: string,
                ) => Promise<{
                  count: number | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      }
    ).from('media_generations');

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const { count, error } = await builder
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('media_type', 'image')
      .gte('created_at', startOfMonth);

    if (error) {
      return 0;
    }

    return count ?? 0;
  } catch {
    return 0;
  }
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assert that the user's request is within their tier quota.
 *
 * @returns QuotaOutcome — switch on `kind` to decide how to proceed.
 *
 * Call order:
 *   1. Tier policy lookup — pure, synchronous, no DB.
 *   2. Early exit if tier has no token cap (BYOK, Local, Enterprise).
 *   3. DB read via getUserClient(token) — RLS-bound, cached per request.
 *   4. Percentage computation.
 *   5. Threshold comparison with early-exit at 'ok'.
 */
export async function assertQuota(opts: AssertQuotaOptions): Promise<QuotaOutcome> {
  const { userId, token, tier, requestedTokens, feature, slot } = opts;

  // async-cheap-condition-before-await: resolve policy from param, no DB hit.
  const policy: TierPolicy = getTierPolicy(tier);

  // Tiers without a token cap (BYOK, Local, Enterprise) are always 'ok'.
  if (policy.tokenCapPerMonth === null || policy.tokenCapPerMonth === undefined) {
    return { kind: 'ok' };
  }

  // capBehavior is required for all capped tiers. If somehow missing, allow.
  if (!policy.capBehavior) {
    return { kind: 'ok' };
  }

  // If a sub-feature quota check is requested, run it alongside the token
  // check in parallel (Vercel rule: async-parallel).
  const checks: Promise<QuotaOutcome>[] = [
    _checkTokenQuota(userId, token, tier, policy, requestedTokens),
  ];

  if (feature) {
    checks.push(_checkFeatureQuota(userId, token, tier, policy, feature));
  }

  // Pro+ flagship daily-cap check fires only when the request is routed to a
  // flagship slot AND the tier policy specifies flagshipDailyTokenCap.
  // js-early-exit: the boolean check on slot avoids touching the DB for
  // every non-flagship request.
  if (
    isFlagshipSlot(slot) &&
    policy.flagshipDailyTokenCap !== undefined &&
    policy.flagshipDailyTokenCap !== null
  ) {
    checks.push(
      _checkFlagshipDailyQuota(userId, token, tier, policy, slot as RoutingSlot, requestedTokens),
    );
  }

  const outcomes = await Promise.all(checks);

  // Return the most severe outcome. Severity order: paywall > downgrade > warn > ok.
  return outcomes.reduce<QuotaOutcome>(
    (worst, current) => {
      const rank = (o: QuotaOutcome): number => {
        if (o.kind === 'paywall') return 3;
        if (o.kind === 'downgrade') return 2;
        if (o.kind === 'warn') return 1;
        return 0;
      };
      return rank(current) > rank(worst) ? current : worst;
    },
    { kind: 'ok' },
  );
}

// ---------------------------------------------------------------------------
// Internal: token quota check
// ---------------------------------------------------------------------------

async function _checkTokenQuota(
  userId: string,
  token: string,
  tier: ProductTier | string,
  policy: TierPolicy,
  requestedTokens: number,
): Promise<QuotaOutcome> {
  const tokenCapPerMonth = policy.tokenCapPerMonth!; // verified non-null above
  const capBehavior = policy.capBehavior!;

  // Fetch usage row — cached so parallel callers dedup.
  const usageRow = await _fetchUsageRow(userId, token);

  // Edge: no row means no usage yet; treat as 0.
  // credits_allocated_cents tracks the monetary equivalent of the token cap.
  // We compute pctUsed in token-space: use credits_used_cents / credits_allocated_cents
  // as the surrogate for token_used / tokenCapPerMonth, since the credit allocation
  // is sized exactly to the token cap at prevailing prices.
  let currentUsedFraction = 0;
  if (usageRow && usageRow.credits_allocated_cents > 0) {
    currentUsedFraction = usageRow.credits_used_cents / usageRow.credits_allocated_cents;
  }

  // Incorporate the pre-flight estimate for the current request.
  // Map requestedTokens to a fraction of the monthly token cap.
  const requestedFraction = requestedTokens / tokenCapPerMonth;
  const pctUsed = currentUsedFraction + requestedFraction;

  return evaluateCapBehavior(pctUsed, capBehavior, tier, 'token_cap');
}

// ---------------------------------------------------------------------------
// Internal: per-feature sub-quota check
// ---------------------------------------------------------------------------

async function _checkFeatureQuota(
  userId: string,
  token: string,
  tier: ProductTier | string,
  policy: TierPolicy,
  feature: QuotaFeature,
): Promise<QuotaOutcome> {
  switch (feature) {
    case 'image':
      return _checkImageQuota(userId, token, tier, policy);
    case 'video':
      return _checkVideoQuota(userId, token, tier, policy);
    case 'computer_use':
      return _checkComputerUseQuota(userId, token, tier, policy);
    case 'mcp':
      return _checkMcpQuota(tier, policy);
    default:
      return { kind: 'ok' };
  }
}

async function _checkImageQuota(
  userId: string,
  token: string,
  tier: ProductTier | string,
  policy: TierPolicy,
): Promise<QuotaOutcome> {
  if (!policy.allowImageGeneration) {
    return {
      kind: 'paywall',
      feature: 'image',
      requiredTier: nextTierUp(tier),
      reason: `Image generation is not available on the ${tier} tier. Upgrade to ${nextTierUp(tier)}.`,
    };
  }

  if (policy.imageQuotaPerMonth === null || policy.imageQuotaPerMonth === undefined) {
    return { kind: 'ok' }; // unlimited
  }

  const usedImages = await _fetchImageUsageCount(userId, token);
  const pctUsed = usedImages / policy.imageQuotaPerMonth;

  if (!policy.capBehavior) return { kind: 'ok' };
  return evaluateCapBehavior(pctUsed, policy.capBehavior, tier, 'image');
}

async function _checkVideoQuota(
  userId: string,
  token: string,
  tier: ProductTier | string,
  policy: TierPolicy,
): Promise<QuotaOutcome> {
  if (!policy.allowVideoGeneration) {
    return {
      kind: 'paywall',
      feature: 'video',
      requiredTier: nextTierUp(tier),
      reason: `Video generation is not available on the ${tier} tier. Upgrade to ${nextTierUp(tier)}.`,
    };
  }

  if (policy.videoSecondsPerMonth === undefined || policy.videoSecondsPerMonth === null) {
    return { kind: 'ok' };
  }

  const usedSeconds = await _fetchVideoSecondsThisMonth(userId, token);
  const pctUsed = usedSeconds / policy.videoSecondsPerMonth;

  if (!policy.capBehavior) return { kind: 'ok' };
  return evaluateCapBehavior(pctUsed, policy.capBehavior, tier, 'video');
}

/**
 * Sum of `duration_seconds` from `media_generations` rows where
 * `media_type = 'video'` for the current calendar month. Returns 0 on any
 * error so the user is never wrongly gated by an infra glitch. RLS-bound.
 */
const _fetchVideoSecondsThisMonth = cache(
  async (userId: string, token: string): Promise<number> => {
    const userClient = getUserClient(token);
    try {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();

      // Cast through unknown — generated types may not include the
      // media_generations table or its `duration_seconds` column yet.
      const builder = userClient.from('media_generations') as unknown as {
        select: (cols: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            eq: (
              col: string,
              val: string,
            ) => {
              gte: (
                col: string,
                val: string,
              ) => Promise<{
                data: Array<{ duration_seconds: number | null }> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };

      const { data, error } = await builder
        .select('duration_seconds')
        .eq('user_id', userId)
        .eq('media_type', 'video')
        .gte('created_at', startOfMonth);

      if (error || !data) return 0;
      return data.reduce((sum, row) => sum + (row.duration_seconds ?? 0), 0);
    } catch {
      return 0;
    }
  },
);

async function _checkComputerUseQuota(
  userId: string,
  token: string,
  tier: ProductTier | string,
  policy: TierPolicy,
): Promise<QuotaOutcome> {
  if (!policy.allowComputerUse) {
    return {
      kind: 'paywall',
      feature: 'computer_use',
      requiredTier: nextTierUp(tier),
      reason: `Computer use is not available on the ${tier} tier. Upgrade to ${nextTierUp(tier)}.`,
    };
  }

  // No cap configured → unlimited within tokenCapPerMonth.
  if (policy.computerUseHardCap === undefined || policy.computerUseHardCap === null) {
    return { kind: 'ok' };
  }

  const usedActions = await _fetchComputerUseActionsThisMonth(userId, token);
  if (usedActions >= policy.computerUseHardCap) {
    return {
      kind: 'paywall',
      feature: 'computer_use',
      requiredTier: nextTierUp(tier),
      reason: `Computer-use hard cap reached (${usedActions}/${policy.computerUseHardCap} actions this month).`,
    };
  }

  if (
    policy.computerUseSoftCap !== undefined &&
    policy.computerUseSoftCap !== null &&
    usedActions >= policy.computerUseSoftCap
  ) {
    return {
      kind: 'warn',
      warning: `Computer-use soft cap reached (${usedActions}/${policy.computerUseSoftCap} actions; hard limit ${policy.computerUseHardCap}).`,
      pctUsed: usedActions / policy.computerUseHardCap,
    };
  }

  return { kind: 'ok' };
}

const _fetchComputerUseActionsThisMonth = cache(
  async (userId: string, token: string): Promise<number> => {
    const userClient = getUserClient(token);
    try {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();

      const builder = userClient.from('credit_transactions') as unknown as {
        select: (
          cols: string,
          opts: { count: string; head: boolean },
        ) => {
          eq: (
            col: string,
            val: string,
          ) => {
            gte: (
              col: string,
              val: string,
            ) => {
              filter: (
                col: string,
                op: string,
                val: string,
              ) => Promise<{
                count: number | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };

      const { count, error } = await builder
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', startOfMonth)
        .filter('metadata->>feature', 'eq', 'computer_use');

      if (error) return 0;
      return count ?? 0;
    } catch {
      return 0;
    }
  },
);

function _checkMcpQuota(tier: ProductTier | string, policy: TierPolicy): QuotaOutcome {
  if (!policy.allowMCP) {
    return {
      kind: 'paywall',
      feature: 'mcp',
      requiredTier: nextTierUp(tier),
      reason: `MCP servers are not available on the ${tier} tier. Upgrade to ${nextTierUp(tier)}.`,
    };
  }
  return { kind: 'ok' };
}

// ---------------------------------------------------------------------------
// Internal: Pro+ flagship daily-cap check
// ---------------------------------------------------------------------------

/**
 * Enforce `flagshipDailyTokenCap` for Pro+ flagship slots.
 *
 * Reads `flagship_daily_tokens` and `flagship_daily_reset_at` from the
 * cached usage row. When the last reset is NULL or older than 24h the
 * counter is treated as 0 (matching the lazy reset performed by the
 * `increment_usage` RPC on the next write).
 *
 * The downgrade outcome routes to the equivalent non-flagship Pro slot
 * (coding_premium_pro for coding, general_balanced_pro for everything else)
 * rather than the flash-lite workhorse, so Pro+ users keep Pro-quality
 * service when they exhaust their daily flagship budget.
 */
async function _checkFlagshipDailyQuota(
  userId: string,
  token: string,
  tier: ProductTier | string,
  policy: TierPolicy,
  slot: RoutingSlot,
  requestedTokens: number,
): Promise<QuotaOutcome> {
  const cap = policy.flagshipDailyTokenCap;
  if (cap === undefined || cap === null || cap <= 0) {
    return { kind: 'ok' };
  }

  const usageRow = await _fetchUsageRow(userId, token);

  let usedToday = 0;
  if (usageRow) {
    const resetAt = usageRow.flagship_daily_reset_at
      ? Date.parse(usageRow.flagship_daily_reset_at)
      : NaN;
    const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
    const counterIsLive = !Number.isNaN(resetAt) && resetAt >= dayAgoMs;

    if (counterIsLive && usageRow.flagship_daily_tokens !== null) {
      usedToday = usageRow.flagship_daily_tokens;
    }
    // else: NULL reset_at OR reset_at older than 24h => counter is stale,
    // treat as 0 — matches the lazy-reset write path in increment_usage.
  }

  const pctUsed = (usedToday + Math.max(0, requestedTokens)) / cap;
  const capBehavior = policy.capBehavior;
  if (!capBehavior) {
    return { kind: 'ok' };
  }

  const outcome = evaluateCapBehavior(pctUsed, capBehavior, tier, 'flagship_daily');

  // For flagship daily exhaustion, downgrade to the matching Pro slot
  // rather than the global flash-lite workhorse so Pro+ users keep
  // Pro-quality service for the rest of the day.
  if (outcome.kind === 'downgrade') {
    const fallbackSlot = FLAGSHIP_TO_PRO_SLOT[slot];
    if (fallbackSlot) {
      return {
        kind: 'downgrade',
        modelOverride: getRoutingSlotModel(fallbackSlot),
        reason: `Pro+ daily flagship cap reached (${Math.round(pctUsed * 100)}% used). Routing to Pro-tier model for the rest of the day.`,
      };
    }
  }

  return outcome;
}

// ---------------------------------------------------------------------------
// reconcileUsage
// ---------------------------------------------------------------------------

/**
 * Reconcile actual token usage after a stream or request completes.
 *
 * Calls the SECURITY DEFINER RPC `increment_usage` atomically. This is the
 * ONLY permitted way to write usage increments. Never call UPDATE on
 * token_credits directly with service_role.
 *
 * This function is fire-and-forget in streaming contexts — the stream has
 * already been sent, so errors are logged but not re-thrown.
 */
export async function reconcileUsage(opts: ReconcileUsageOptions): Promise<void> {
  const { userId, token, actualTokens, feature, isFlagship } = opts;

  if (actualTokens <= 0) return;

  const userClient = getUserClient(token);

  // Call SECURITY DEFINER RPC — atomic, RLS-safe increment.
  const { error } = await (
    userClient.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>
  )('increment_usage', {
    p_user_id: userId,
    p_tokens: actualTokens,
    p_feature: feature ?? 'chat',
    p_is_flagship: isFlagship ?? false,
  });

  if (error) {
    // reconcileUsage is called after the stream — cannot surface errors to caller.
    // Log for monitoring. The credit_service deductCredits path provides the
    // primary reconciliation; this RPC is the quota-counter update path.
    logger.error(
      { userId, actualTokens, feature, isFlagship, error: error.message },
      '[reconcileUsage] increment_usage RPC failed — usage counter may drift',
    );
  }
}
