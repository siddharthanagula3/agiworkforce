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
    yearlyPriceUsd: 204,
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
    monthlyPriceUsd: 25,
    yearlyPriceUsd: 240,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
};

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
