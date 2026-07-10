export type BillingPlanTier =
  | 'local-only'
  | 'byok'
  | 'free'
  | 'basic'
  | 'pro'
  | 'max'
  | 'team'
  | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';

/**
 * Fallback ratio for tiers that don't define an explicit usage budget
 * (`monthlyUsageBudgetUsd`/`dailyUsageBudgetUsd` below) — currently only
 * `team`/`enterprise`, whose per-seat/custom budgets haven't been fixed yet.
 * Founder-set explicit dollar budgets (free/basic/pro/max, 2026-07-02) take
 * priority over this ratio wherever both exist — see `getPlanUsageBudgetCents`.
 */
export const INCLUDED_USAGE_BUDGET_RATIO = 0.35;

export interface BillingPlanPricing {
  id: BillingPlanTier;
  label: string;
  monthlyPriceUsd: number;
  yearlyPriceUsd: number;
  /** India-specific monthly price in INR, when it differs from a straight USD conversion. */
  monthlyPriceInr?: number;
  /**
   * Explicit monthly included-usage budget in USD (founder-set, 2026-07-02).
   * When present, this is used instead of `INCLUDED_USAGE_BUDGET_RATIO`.
   */
  monthlyUsageBudgetUsd?: number;
  /**
   * Explicit DAILY included-usage budget in USD, for tiers billed with no
   * monthly cycle to reset against (currently only `free`). When present,
   * this takes priority over `monthlyUsageBudgetUsd` for daily-reset gating.
   */
  dailyUsageBudgetUsd?: number;
}

export const BILLING_PLAN_PRICING: Record<BillingPlanTier, BillingPlanPricing> = {
  'local-only': {
    id: 'local-only',
    label: 'Local Mode',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  byok: {
    id: 'byok',
    label: 'Local Mode + BYOK',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  free: {
    id: 'free',
    label: 'Free',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    // $0.005/day, not a fixed prompt count — see free-trial-service.ts.
    dailyUsageBudgetUsd: 0.005,
  },
  basic: {
    id: 'basic',
    label: 'Basic',
    monthlyPriceUsd: 8,
    yearlyPriceUsd: 0,
    monthlyPriceInr: 399,
    monthlyUsageBudgetUsd: 2,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    monthlyPriceUsd: 20,
    yearlyPriceUsd: 200,
    monthlyUsageBudgetUsd: 10,
  },
  max: {
    id: 'max',
    label: 'Max',
    monthlyPriceUsd: 100,
    yearlyPriceUsd: 0,
    monthlyUsageBudgetUsd: 75,
  },
  team: {
    id: 'team',
    label: 'Team',
    monthlyPriceUsd: 30,
    yearlyPriceUsd: 299,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
};

/** Product surfaces that render plan-selection / upgrade / comparison lists. */
export type BillingSurface = 'web' | 'desktop' | 'mobile';

/**
 * Surfaces on which each plan tier is offered as a SELECTABLE / suggested
 * upgrade target in plan-selection, upgrade, and comparison lists.
 *
 * DISPLAY-ONLY. This does NOT affect pricing math, tier resolution, price-id
 * mapping, or an existing subscriber's ability to see their own current plan
 * in billing — it only governs whether a tier appears as a choosable option
 * on a given surface.
 *
 * Founder decision (2026-07): the `basic` tier is mobile-only — hidden from
 * the web and desktop pricing/upgrade UIs, shown on mobile. Every other tier
 * stays visible on every surface it already appeared on. Data-driven so a
 * future mobile-only (or web-only) tier is a one-line change here.
 */
export const PLAN_SURFACE_VISIBILITY: Record<BillingPlanTier, readonly BillingSurface[]> = {
  'local-only': ['web', 'desktop', 'mobile'],
  byok: ['web', 'desktop', 'mobile'],
  free: ['web', 'desktop', 'mobile'],
  basic: ['mobile'],
  pro: ['web', 'desktop', 'mobile'],
  max: ['web', 'desktop', 'mobile'],
  team: ['web', 'desktop', 'mobile'],
  enterprise: ['web', 'desktop', 'mobile'],
};

/**
 * Whether `plan` may be shown as a selectable/upgrade option on `surface`.
 * Unknown values normalize to `free` (visible everywhere). Use this at every
 * plan-LIST render site; do not use it for tier resolution or current-plan
 * display (an existing subscriber must always see their own plan).
 */
export function isPlanSelectableOnSurface(
  plan: string | null | undefined,
  surface: BillingSurface,
): boolean {
  return PLAN_SURFACE_VISIBILITY[normalizeBillingPlanTier(plan)].includes(surface);
}

export function isBillingPlanTier(value: string | null | undefined): value is BillingPlanTier {
  if (!value) return false;
  return value in BILLING_PLAN_PRICING;
}

export function normalizeBillingPlanTier(value: string | null | undefined): BillingPlanTier {
  if (!value) return 'free';
  const normalized = value.toLowerCase();
  return isBillingPlanTier(normalized) ? normalized : 'free';
}

export function getBillingPlanPricing(plan: string | null | undefined): BillingPlanPricing {
  return BILLING_PLAN_PRICING[normalizeBillingPlanTier(plan)];
}

export function getPlanPriceUsd(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number {
  const pricing = getBillingPlanPricing(plan);
  return interval === 'yearly' ? pricing.yearlyPriceUsd : pricing.monthlyPriceUsd;
}

export function getPlanPriceCents(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number {
  return Math.round(getPlanPriceUsd(plan, interval) * 100);
}

export function getUsageBudgetCentsFromPriceCents(
  priceCents: number,
  ratio: number = INCLUDED_USAGE_BUDGET_RATIO,
): number {
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    return 0;
  }
  return Math.round(priceCents * ratio);
}

/**
 * Monthly included-usage budget in cents for `plan`.
 *
 * Prefers the tier's explicit `monthlyUsageBudgetUsd` (founder-set dollar
 * amount) when defined. Falls back to `priceCents * ratio` only for tiers
 * that don't define one yet (`team`, `enterprise`) — this preserves the
 * pre-2026-07-02 behavior for those two tiers without guessing a number
 * nobody has confirmed.
 */
export function getPlanUsageBudgetCents(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
  ratio: number = INCLUDED_USAGE_BUDGET_RATIO,
): number {
  const pricing = getBillingPlanPricing(plan);
  if (typeof pricing.monthlyUsageBudgetUsd === 'number') {
    return Math.round(pricing.monthlyUsageBudgetUsd * 100);
  }
  return getUsageBudgetCentsFromPriceCents(getPlanPriceCents(plan, interval), ratio);
}

export function getPlanUsageBudgetUsd(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
  ratio: number = INCLUDED_USAGE_BUDGET_RATIO,
): number {
  return getPlanUsageBudgetCents(plan, interval, ratio) / 100;
}

/**
 * Daily included-usage budget in cents for `plan` — only meaningful for
 * `free` today (`$0.005/day`, replacing the old fixed-3-prompts gate). Other
 * tiers reset monthly (via Stripe billing cycle), not daily, so this returns
 * 0 for them; callers should use `getPlanUsageBudgetCents` for those.
 */
export function getPlanDailyUsageBudgetCents(plan: string | null | undefined): number {
  const pricing = getBillingPlanPricing(plan);
  if (typeof pricing.dailyUsageBudgetUsd === 'number') {
    return Math.round(pricing.dailyUsageBudgetUsd * 100);
  }
  return 0;
}

export function getPlanDailyUsageBudgetUsd(plan: string | null | undefined): number {
  return getPlanDailyUsageBudgetCents(plan) / 100;
}

/** India-specific monthly price in INR for `plan`, or null if not defined (USD-only tier). */
export function getPlanPriceInr(plan: string | null | undefined): number | null {
  const pricing = getBillingPlanPricing(plan);
  return typeof pricing.monthlyPriceInr === 'number' ? pricing.monthlyPriceInr : null;
}

/**
 * Weekly included-usage budget in cents — a rolling-window pacing layer on
 * top of the monthly budget (founder decision, 2026-07-05), not a
 * replacement for it. Derived as monthly × 12/52 (an even weekly slice of
 * the monthly budget; 52 weeks ÷ 12 months ≈ 4.33 weeks/month). Monthly
 * credits remain the real billing-period cap enforced via `token_credits`;
 * this only paces spend within that same pool more evenly across the month.
 */
export function getPlanWeeklyUsageBudgetCents(plan: string | null | undefined): number {
  return Math.round((getPlanUsageBudgetCents(plan) * 12) / 52);
}

export function getPlanWeeklyUsageBudgetUsd(plan: string | null | undefined): number {
  return getPlanWeeklyUsageBudgetCents(plan) / 100;
}

/**
 * Fraction of the weekly budget a single rolling 5-hour session may consume
 * (founder decision, 2026-07-05) — mirrors Claude's session-pacing pattern.
 */
export const SESSION_OF_WEEKLY_BUDGET_RATIO = 0.2;

/** Rolling 5-hour session budget in cents: `SESSION_OF_WEEKLY_BUDGET_RATIO` of the weekly budget. */
export function getPlanSessionUsageBudgetCents(plan: string | null | undefined): number {
  return Math.round(getPlanWeeklyUsageBudgetCents(plan) * SESSION_OF_WEEKLY_BUDGET_RATIO);
}

export function getPlanSessionUsageBudgetUsd(plan: string | null | undefined): number {
  return getPlanSessionUsageBudgetCents(plan) / 100;
}

/**
 * Fraction of the weekly budget reserved for flagship-model usage
 * specifically (the "Fable only" style sub-bucket, distinct from the
 * "All models" weekly bucket). Matches the existing 30%-of-parent-budget
 * convention already used by `calculate_daily_limit` in 0020_functions.sql,
 * for consistency with the rest of the credit system rather than inventing
 * a new ratio.
 */
export const FLAGSHIP_OF_WEEKLY_BUDGET_RATIO = 0.3;

/** Rolling weekly budget in cents for flagship-model usage only. */
export function getPlanFlagshipWeeklyUsageBudgetCents(plan: string | null | undefined): number {
  return Math.round(getPlanWeeklyUsageBudgetCents(plan) * FLAGSHIP_OF_WEEKLY_BUDGET_RATIO);
}

export function getPlanFlagshipWeeklyUsageBudgetUsd(plan: string | null | undefined): number {
  return getPlanFlagshipWeeklyUsageBudgetCents(plan) / 100;
}
