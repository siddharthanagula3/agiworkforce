import 'server-only';

import {
  CREDITS_PER_CENT,
  FLAGSHIP_OF_WEEKLY_BUDGET_RATIO,
  MICROUSD_PER_CREDIT,
  isFreeBillingPlanTier,
  managedUsageLimitsForCatalogVersion,
  type BillingInterval,
  type BillingPlanTier,
  type ManagedUsageLimit,
} from '@agiworkforce/types';

export type ManagedUsageCapCents = number | null;
export type ManagedUsageCapMicrousd = number | null;

export const MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS = 100_000_000;
export const MICROUSD_PER_LEDGER_CENT = 10_000;
export const MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_MICROUSD =
  MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS * MICROUSD_PER_LEDGER_CENT;

export { FLAGSHIP_OF_WEEKLY_BUDGET_RATIO };

export function toPublicUsagePercentage(used: number, limit: number): number {
  if (limit <= 0) return 0;
  const boundedUsed = Math.min(limit, Math.max(0, used));
  return Math.round((boundedUsed / limit) * 10_000) / 100;
}

export interface VersionedPlanTier {
  tier: string | null | undefined;
  catalogVersion: number | null | undefined;
}

export type PlanAllowanceSubject = string | null | undefined | VersionedPlanTier;

function subjectTier(plan: PlanAllowanceSubject): string | null {
  const tier = typeof plan === 'object' && plan !== null ? plan.tier : plan;
  return tier ? tier.trim().toLowerCase() : null;
}

function getLimit(plan: PlanAllowanceSubject): ManagedUsageLimit | null {
  const tier = subjectTier(plan);
  if (!tier) return null;
  const limits = managedUsageLimitsForCatalogVersion(
    typeof plan === 'object' && plan !== null ? plan.catalogVersion : null,
  );
  return Object.prototype.hasOwnProperty.call(limits, tier)
    ? limits[tier as BillingPlanTier]
    : null;
}

function isFreeSubject(plan: PlanAllowanceSubject): boolean {
  return isFreeBillingPlanTier(subjectTier(plan));
}

export function getPlanMonthlyUsageCredits(plan: PlanAllowanceSubject): number {
  return getLimit(plan)?.monthlyCredits ?? 0;
}

export function getPlanWeeklyUsageCredits(plan: PlanAllowanceSubject): number {
  return getLimit(plan)?.weeklyCredits ?? 0;
}

export function getPlanDailyUsageCredits(plan: PlanAllowanceSubject): number {
  return getLimit(plan)?.dailyCredits ?? 0;
}

export function getPlanFiveHourUsageCredits(plan: PlanAllowanceSubject): number {
  return getLimit(plan)?.fiveHourCredits ?? 0;
}

export function getPlanMonthlyUsageBudgetMicrousd(plan: PlanAllowanceSubject): number {
  return getPlanMonthlyUsageCredits(plan) * MICROUSD_PER_CREDIT;
}

export function getPlanWeeklyUsageBudgetMicrousd(plan: PlanAllowanceSubject): number {
  return getPlanWeeklyUsageCredits(plan) * MICROUSD_PER_CREDIT;
}

export function getPlanFiveHourUsageBudgetMicrousd(plan: PlanAllowanceSubject): number {
  return getPlanFiveHourUsageCredits(plan) * MICROUSD_PER_CREDIT;
}

function creditsToLedgerCents(credits: number): number {
  if (credits <= 0) return 0;
  if (credits % CREDITS_PER_CENT !== 0) {
    throw new Error('Managed usage allocation cannot be represented by the paid cents ledger');
  }
  return credits / CREDITS_PER_CENT;
}

export function isPlanUsageUncapped(plan: PlanAllowanceSubject): boolean {
  return getLimit(plan)?.unlimited === true;
}

export function getPlanUsageBudgetCents(
  plan: PlanAllowanceSubject,
  _interval: BillingInterval = 'monthly',
): number {
  if (isPlanUsageUncapped(plan)) return MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS;
  if (isFreeSubject(plan)) return 0;
  return creditsToLedgerCents(getPlanMonthlyUsageCredits(plan));
}

export function getPlanWeeklyUsageBudgetCents(plan: PlanAllowanceSubject): number {
  if (isFreeSubject(plan)) return 0;
  return creditsToLedgerCents(getPlanWeeklyUsageCredits(plan));
}

export function getPlanSessionUsageBudgetCents(plan: PlanAllowanceSubject): number {
  if (isFreeSubject(plan)) return 0;
  return creditsToLedgerCents(getPlanFiveHourUsageCredits(plan));
}

export function getPlanFlagshipWeeklyUsageBudgetCents(plan: PlanAllowanceSubject): number {
  return Math.round(getPlanWeeklyUsageBudgetCents(plan) * FLAGSHIP_OF_WEEKLY_BUDGET_RATIO);
}

export function getPlanSessionUsageCapCents(plan: PlanAllowanceSubject): ManagedUsageCapCents {
  return isPlanUsageUncapped(plan) ? null : getPlanSessionUsageBudgetCents(plan);
}

export function getPlanWeeklyUsageCapCents(plan: PlanAllowanceSubject): ManagedUsageCapCents {
  return isPlanUsageUncapped(plan) ? null : getPlanWeeklyUsageBudgetCents(plan);
}

export function getPlanFlagshipWeeklyUsageCapCents(
  plan: PlanAllowanceSubject,
): ManagedUsageCapCents {
  return isPlanUsageUncapped(plan) ? null : getPlanFlagshipWeeklyUsageBudgetCents(plan);
}

/**
 * The ledger settles in microUSD since 0182. These are the same ceilings the
 * cents getters return, scaled, rather than a second derivation from the unit
 * table: a cap is a whole number of ledger cents by construction, so scaling
 * loses nothing, and a plan whose allowance the two derivations disagree on
 * (free, which declares five-hour credits and a zero paid budget) cannot end up
 * with two different ceilings.
 */
function toCapMicrousd(cap: ManagedUsageCapCents): ManagedUsageCapMicrousd {
  return cap === null ? null : cap * MICROUSD_PER_LEDGER_CENT;
}

export function getPlanUsageBudgetMicrousd(
  plan: PlanAllowanceSubject,
  interval: BillingInterval = 'monthly',
): number {
  return getPlanUsageBudgetCents(plan, interval) * MICROUSD_PER_LEDGER_CENT;
}

export function getPlanSessionUsageBudgetMicrousd(plan: PlanAllowanceSubject): number {
  return getPlanSessionUsageBudgetCents(plan) * MICROUSD_PER_LEDGER_CENT;
}

export function getPlanWeeklyUsagePaidBudgetMicrousd(plan: PlanAllowanceSubject): number {
  return getPlanWeeklyUsageBudgetCents(plan) * MICROUSD_PER_LEDGER_CENT;
}

export function getPlanFlagshipWeeklyUsageBudgetMicrousd(plan: PlanAllowanceSubject): number {
  return getPlanFlagshipWeeklyUsageBudgetCents(plan) * MICROUSD_PER_LEDGER_CENT;
}

export function getPlanSessionUsageCapMicrousd(
  plan: PlanAllowanceSubject,
): ManagedUsageCapMicrousd {
  return toCapMicrousd(getPlanSessionUsageCapCents(plan));
}

export function getPlanWeeklyUsageCapMicrousd(plan: PlanAllowanceSubject): ManagedUsageCapMicrousd {
  return toCapMicrousd(getPlanWeeklyUsageCapCents(plan));
}

export function getPlanFlagshipWeeklyUsageCapMicrousd(
  plan: PlanAllowanceSubject,
): ManagedUsageCapMicrousd {
  return toCapMicrousd(getPlanFlagshipWeeklyUsageCapCents(plan));
}

export const QUOTA_WARNING_THRESHOLD_PERCENT = 80;
export const QUOTA_CRITICAL_THRESHOLD_PERCENT = 95;

export type QuotaWarningScope =
  'billing_period' | 'rolling_five_hour' | 'rolling_weekly' | 'computer_use_soft_cap';

export function buildComputerUseSoftCapWarningHeader(input: {
  usedUnits: number;
  softLimitUnits: number;
}): string | null {
  if (!Number.isFinite(input.softLimitUnits) || input.softLimitUnits <= 0) return null;
  const percent = toPublicUsagePercentage(Math.max(0, input.usedUnits), input.softLimitUnits);
  return [
    'level=warning',
    'scope=computer_use_soft_cap',
    `used_percent=${Math.round(percent)}`,
    'threshold_percent=100',
  ].join('; ');
}

export interface QuotaWarningInput {
  planTier: PlanAllowanceSubject;
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
