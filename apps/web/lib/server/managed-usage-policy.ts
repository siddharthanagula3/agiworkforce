import 'server-only';

import type { BillingInterval, BillingPlanTier } from '@agiworkforce/types';

interface ManagedUsageLimit {
  monthlyUnits: number;
  weeklyUnits: number;
  fiveHourUnits: number;
  dailyUnits: number;
  unlimited: boolean;
}

export type ManagedUsageCapCents = number | null;

export const MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS = 100_000_000;

const MANAGED_USAGE_LIMITS: Readonly<Record<BillingPlanTier, ManagedUsageLimit>> = Object.freeze({
  'local-only': {
    monthlyUnits: 0,
    weeklyUnits: 0,
    fiveHourUnits: 0,
    dailyUnits: 0,
    unlimited: false,
  },
  byok: { monthlyUnits: 0, weeklyUnits: 0, fiveHourUnits: 0, dailyUnits: 0, unlimited: false },
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

export function isPlanUsageUncapped(plan: string | null | undefined): boolean {
  return getLimit(plan)?.unlimited === true;
}

export function getPlanUsageBudgetCents(
  plan: string | null | undefined,
  _interval: BillingInterval = 'monthly',
): number {
  if (isPlanUsageUncapped(plan)) return MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS;
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

export const QUOTA_WARNING_THRESHOLD_PERCENT = 80;
export const QUOTA_CRITICAL_THRESHOLD_PERCENT = 95;

export type QuotaWarningScope = 'billing_period' | 'rolling_five_hour' | 'rolling_weekly';

export interface QuotaWarningInput {
  planTier: string | null | undefined;
  creditsUsedCents: number;
  creditsAllocatedCents: number;
  estimatedCostCents?: number;
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
