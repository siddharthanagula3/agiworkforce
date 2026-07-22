import 'server-only';

import type { BillingInterval, BillingPlanTier } from '@agiworkforce/types';

interface ManagedUsageLimit {
  monthlyUnits: number;
  weeklyUnits: number;
  fiveHourUnits: number;
  dailyUnits: number;
}

/**
 * Private managed-compute allowances. These values must never be serialized
 * into pricing, usage, or client configuration responses. Public clients get
 * percentages and reset times only.
 */
const MANAGED_USAGE_LIMITS: Readonly<Record<BillingPlanTier, ManagedUsageLimit>> = Object.freeze({
  'local-only': { monthlyUnits: 0, weeklyUnits: 0, fiveHourUnits: 0, dailyUnits: 0 },
  byok: { monthlyUnits: 0, weeklyUnits: 0, fiveHourUnits: 0, dailyUnits: 0 },
  free: { monthlyUnits: 20, weeklyUnits: 15, fiveHourUnits: 5, dailyUnits: 0 },
  basic: { monthlyUnits: 400, weeklyUnits: 100, fiveHourUnits: 20, dailyUnits: 0 },
  pro: { monthlyUnits: 2_000, weeklyUnits: 500, fiveHourUnits: 100, dailyUnits: 0 },
  max: { monthlyUnits: 10_000, weeklyUnits: 2_500, fiveHourUnits: 500, dailyUnits: 0 },
  max_15x: {
    monthlyUnits: 30_000,
    weeklyUnits: 7_500,
    fiveHourUnits: 1_500,
    dailyUnits: 0,
  },
  team: { monthlyUnits: 2_000, weeklyUnits: 500, fiveHourUnits: 100, dailyUnits: 0 },
  enterprise: { monthlyUnits: 0, weeklyUnits: 0, fiveHourUnits: 0, dailyUnits: 0 },
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

/** Paid billing-period allocation for the existing cents ledger. */
export function getPlanUsageBudgetCents(
  plan: string | null | undefined,
  _interval: BillingInterval = 'monthly',
): number {
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
