import 'server-only';

import type { BillingInterval, BillingPlanTier } from '@agiworkforce/types';

interface ManagedUsageLimit {
  monthlyUnits: number;
  weeklyUnits: number;
  fiveHourUnits: number;
  dailyUnits: number;
  /**
   * GOV-1: explicit "this tier has NO configured spend ceiling" marker.
   *
   * Before this flag every tier expressed "no cap" and "cap of zero" with the
   * same value (0), and the SQL guard `p_*_cap_cents > 0` turned that single
   * value into UNLIMITED. That inverted fail-closed: Enterprise (an all-zero
   * row) had no rolling ceiling at all on the only durable usage gate.
   *
   * The two states are now distinct and the DEFAULT IS DENY:
   *   unlimited: true  -> cap resolves to null -> SQL treats it as no ceiling
   *   unlimited: false -> cap resolves to a number; 0 means "deny every
   *                       reservation against this ledger", not "unlimited"
   */
  unlimited: boolean;
}

/**
 * A resolved rolling/period ceiling in paid-ledger cents.
 * `null` = explicitly uncapped (negotiated contract). A number is a hard
 * ceiling, and 0 denies every reservation.
 */
export type ManagedUsageCapCents = number | null;

/**
 * GOV-2: ledger allocation used for tiers whose contract carries no numeric
 * monthly allowance (Enterprise). The paid ledger still needs a real account —
 * `CreditService.checkAvailable` returns false without one, which hard-blocked
 * every Enterprise chat with "Usage budget exhausted. Upgrade your plan".
 *
 * This is HEADROOM, NOT A PRICE OR A SPEND CEILING: an uncapped tier's actual
 * governor is its negotiated contract plus the rolling caps above (which
 * resolve to null for it). It exists only so the cents ledger has an account
 * to debit against.
 */
export const MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS = 100_000_000;

/**
 * Private managed-compute allowances. These values must never be serialized
 * into pricing, usage, or client configuration responses. Public clients get
 * percentages and reset times only.
 */
const MANAGED_USAGE_LIMITS: Readonly<Record<BillingPlanTier, ManagedUsageLimit>> = Object.freeze({
  // Local trust boundary: never admitted to managed compute. Zero WITHOUT the
  // unlimited marker now means deny, which is what these tiers must get.
  'local-only': {
    monthlyUnits: 0,
    weeklyUnits: 0,
    fiveHourUnits: 0,
    dailyUnits: 0,
    unlimited: false,
  },
  byok: { monthlyUnits: 0, weeklyUnits: 0, fiveHourUnits: 0, dailyUnits: 0, unlimited: false },
  // Free's allowance is real but lives in the separate micro-USD reservation
  // ledger; against the PAID cents ledger its cap is 0 = deny.
  free: { monthlyUnits: 20, weeklyUnits: 15, fiveHourUnits: 5, dailyUnits: 0, unlimited: false },
  basic: {
    monthlyUnits: 400,
    weeklyUnits: 100,
    fiveHourUnits: 20,
    dailyUnits: 0,
    unlimited: false,
  },
  pro: {
    monthlyUnits: 2_000,
    weeklyUnits: 500,
    fiveHourUnits: 100,
    dailyUnits: 0,
    unlimited: false,
  },
  max: {
    monthlyUnits: 10_000,
    weeklyUnits: 2_500,
    fiveHourUnits: 500,
    dailyUnits: 0,
    unlimited: false,
  },
  max_15x: {
    monthlyUnits: 30_000,
    weeklyUnits: 7_500,
    fiveHourUnits: 1_500,
    dailyUnits: 0,
    unlimited: false,
  },
  team: {
    monthlyUnits: 2_000,
    weeklyUnits: 500,
    fiveHourUnits: 100,
    dailyUnits: 0,
    unlimited: false,
  },
  // Negotiated contract: DELIBERATELY uncapped, declared rather than inferred
  // from a zero. Its spend governor is the contract, not this table.
  enterprise: {
    monthlyUnits: 0,
    weeklyUnits: 0,
    fiveHourUnits: 0,
    dailyUnits: 0,
    unlimited: true,
  },
});

const INTERNAL_USAGE_UNITS_PER_LEDGER_CENT = 2;
const MICROUSD_PER_INTERNAL_USAGE_UNIT = 5_000;
const FLAGSHIP_OF_WEEKLY_BUDGET_RATIO = 0.3;

/** Convert private server ledger values to the only public numeric usage value. */
export function toPublicUsagePercentage(used: number, limit: number): number {
  if (limit <= 0) return 0;
  const boundedUsed = Math.min(limit, Math.max(0, used));
  return Math.round((boundedUsed / limit) * 10_000) / 100;
}

function getLimit(plan: string | null | undefined): ManagedUsageLimit | null {
  if (!plan) return null;
  const normalized = plan.trim().toLowerCase() as BillingPlanTier;
  return Object.prototype.hasOwnProperty.call(MANAGED_USAGE_LIMITS, normalized)
    ? MANAGED_USAGE_LIMITS[normalized]
    : null;
}

export function getPlanMonthlyUsageUnits(plan: string | null | undefined): number {
  return getLimit(plan)?.monthlyUnits ?? 0;
}

export function getPlanWeeklyUsageUnits(plan: string | null | undefined): number {
  return getLimit(plan)?.weeklyUnits ?? 0;
}

export function getPlanDailyUsageUnits(plan: string | null | undefined): number {
  return getLimit(plan)?.dailyUnits ?? 0;
}

export function getPlanFiveHourUsageUnits(plan: string | null | undefined): number {
  return getLimit(plan)?.fiveHourUnits ?? 0;
}

export function getPlanMonthlyUsageBudgetMicrousd(plan: string | null | undefined): number {
  return getPlanMonthlyUsageUnits(plan) * MICROUSD_PER_INTERNAL_USAGE_UNIT;
}

export function getPlanWeeklyUsageBudgetMicrousd(plan: string | null | undefined): number {
  return getPlanWeeklyUsageUnits(plan) * MICROUSD_PER_INTERNAL_USAGE_UNIT;
}

export function getPlanFiveHourUsageBudgetMicrousd(plan: string | null | undefined): number {
  return getPlanFiveHourUsageUnits(plan) * MICROUSD_PER_INTERNAL_USAGE_UNIT;
}

export function getInternalUsageUnitMicrousd(): number {
  return MICROUSD_PER_INTERNAL_USAGE_UNIT;
}

function unitsToLedgerCents(units: number): number {
  if (units <= 0) return 0;
  if (units % INTERNAL_USAGE_UNITS_PER_LEDGER_CENT !== 0) {
    throw new Error('Managed usage allocation cannot be represented by the paid cents ledger');
  }
  return units / INTERNAL_USAGE_UNITS_PER_LEDGER_CENT;
}

/** GOV-1: whether `plan` is declared as having no configured spend ceiling. */
export function isPlanUsageUncapped(plan: string | null | undefined): boolean {
  return getLimit(plan)?.unlimited === true;
}

/**
 * Paid billing-period allocation for the existing cents ledger.
 *
 * GOV-2: an uncapped tier resolves to real ledger headroom instead of 0, so
 * `allocateCreditsForPeriod` actually creates its credit account and
 * `CreditService.checkAvailable` stops 402-ing the highest-paying tier.
 */
export function getPlanUsageBudgetCents(
  plan: string | null | undefined,
  _interval: BillingInterval = 'monthly',
): number {
  if (isPlanUsageUncapped(plan)) return MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS;
  // Free is metered in the separate micro-USD reservation ledger because its
  // five-hour and weekly allocations contain half-cent units.
  if (getLimit(plan) === MANAGED_USAGE_LIMITS.free) return 0;
  return unitsToLedgerCents(getPlanMonthlyUsageUnits(plan));
}

export function getPlanWeeklyUsageBudgetCents(plan: string | null | undefined): number {
  if (getLimit(plan) === MANAGED_USAGE_LIMITS.free) return 0;
  return unitsToLedgerCents(getPlanWeeklyUsageUnits(plan));
}

export function getPlanSessionUsageBudgetCents(plan: string | null | undefined): number {
  if (getLimit(plan) === MANAGED_USAGE_LIMITS.free) return 0;
  return unitsToLedgerCents(getPlanFiveHourUsageUnits(plan));
}

export function getPlanFlagshipWeeklyUsageBudgetCents(plan: string | null | undefined): number {
  return Math.round(getPlanWeeklyUsageBudgetCents(plan) * FLAGSHIP_OF_WEEKLY_BUDGET_RATIO);
}

/**
 * GOV-1: the rolling ceilings actually handed to SQL.
 *
 * `null` is passed only for a tier that DECLARES itself uncapped; every other
 * tier — including one whose numeric allowance is 0 — gets a number, and the
 * migration's `is not null` guard turns 0 into a denial instead of a bypass.
 */
export function getPlanSessionUsageCapCents(plan: string | null | undefined): ManagedUsageCapCents {
  return isPlanUsageUncapped(plan) ? null : getPlanSessionUsageBudgetCents(plan);
}

export function getPlanWeeklyUsageCapCents(plan: string | null | undefined): ManagedUsageCapCents {
  return isPlanUsageUncapped(plan) ? null : getPlanWeeklyUsageBudgetCents(plan);
}

export function getPlanFlagshipWeeklyUsageCapCents(
  plan: string | null | undefined,
): ManagedUsageCapCents {
  return isPlanUsageUncapped(plan) ? null : getPlanFlagshipWeeklyUsageBudgetCents(plan);
}

/* ────────────────────────────────────────────────────────────────────────────
 * GOV-18: the `X-Quota-Warning` producer.
 *
 * `request-processor.ts` declared `const quotaWarningHeader: string | null =
 * null;` — a hardcoded null — while three sites emitted `X-Quota-Warning` from
 * it, so the PRE-limit warning could never fire: a user's first signal that
 * they were out of capacity was the hard refusal itself.
 *
 * The header value is structured and machine-parseable so the client can
 * localize it, rather than a pre-baked English sentence:
 *
 *   level=warning; scope=billing_period; used_percent=87; threshold_percent=80
 * ──────────────────────────────────────────────────────────────────────────── */

/** Percentage of an allowance at which a warning starts being emitted. */
export const QUOTA_WARNING_THRESHOLD_PERCENT = 80;
/** Percentage at which the warning escalates to `level=critical`. */
export const QUOTA_CRITICAL_THRESHOLD_PERCENT = 95;

export type QuotaWarningScope = 'billing_period' | 'rolling_five_hour' | 'rolling_weekly';

export interface QuotaWarningInput {
  planTier: string | null | undefined;
  /** Paid-ledger cents already consumed in the current billing period. */
  creditsUsedCents: number;
  /** Paid-ledger cents allocated for the current billing period. */
  creditsAllocatedCents: number;
  /** Estimated cost of the request being admitted, included in the projection. */
  estimatedCostCents?: number;
  /** Optional rolling-window observations, when the caller already has them. */
  rolling?: {
    sessionUsedCents?: number;
    weeklyUsedCents?: number;
  };
}

interface ScoredWindow {
  scope: QuotaWarningScope;
  percent: number;
}

function projectedPercent(used: number, estimated: number, limit: number): number | null {
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return toPublicUsagePercentage(Math.max(0, used) + Math.max(0, estimated), limit);
}

/**
 * Build the `X-Quota-Warning` value for one admitted request, or null when
 * every applicable allowance is still below the warning threshold.
 *
 * A tier that declares itself uncapped never warns — it has no ceiling to
 * approach. The WORST window wins, so a user at 60% of their month but 92% of
 * their rolling 5 hours is warned about the window that will actually stop
 * them next.
 */
export function buildQuotaWarningHeader(input: QuotaWarningInput): string | null {
  if (isPlanUsageUncapped(input.planTier)) return null;

  const estimated = input.estimatedCostCents ?? 0;
  const candidates: ScoredWindow[] = [];

  const periodPercent = projectedPercent(
    input.creditsUsedCents,
    estimated,
    input.creditsAllocatedCents,
  );
  if (periodPercent !== null) candidates.push({ scope: 'billing_period', percent: periodPercent });

  const sessionPercent = projectedPercent(
    input.rolling?.sessionUsedCents ?? 0,
    estimated,
    getPlanSessionUsageBudgetCents(input.planTier),
  );
  if (input.rolling?.sessionUsedCents !== undefined && sessionPercent !== null) {
    candidates.push({ scope: 'rolling_five_hour', percent: sessionPercent });
  }

  const weeklyPercent = projectedPercent(
    input.rolling?.weeklyUsedCents ?? 0,
    estimated,
    getPlanWeeklyUsageBudgetCents(input.planTier),
  );
  if (input.rolling?.weeklyUsedCents !== undefined && weeklyPercent !== null) {
    candidates.push({ scope: 'rolling_weekly', percent: weeklyPercent });
  }

  let worst: ScoredWindow | null = null;
  for (const candidate of candidates) {
    if (!worst || candidate.percent > worst.percent) worst = candidate;
  }

  if (!worst || worst.percent < QUOTA_WARNING_THRESHOLD_PERCENT) return null;

  const level = worst.percent >= QUOTA_CRITICAL_THRESHOLD_PERCENT ? 'critical' : 'warning';

  return [
    `level=${level}`,
    `scope=${worst.scope}`,
    `used_percent=${Math.round(worst.percent)}`,
    `threshold_percent=${QUOTA_WARNING_THRESHOLD_PERCENT}`,
  ].join('; ');
}
