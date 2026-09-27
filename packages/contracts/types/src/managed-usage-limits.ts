import {
  isMax15xPlanTier,
  isMaxPlanTier,
  isPerSeatBillingPlan,
  isProPlanTier,
  type BillingPlanTier,
} from './billing-catalog';
import { BILLING_PLAN_CATALOG_VERSION } from './billing-plan-catalog';

export interface ManagedUsageLimit {
  monthlyCredits: number;
  weeklyCredits: number;
  fiveHourCredits: number;
  dailyCredits: number;
  unlimited: boolean;
}

const NO_MANAGED_USAGE: ManagedUsageLimit = {
  monthlyCredits: 0,
  weeklyCredits: 0,
  fiveHourCredits: 0,
  dailyCredits: 0,
  unlimited: false,
};

export const FLAGSHIP_OF_WEEKLY_BUDGET_RATIO = 0.3;

export const MANAGED_USAGE_LIMITS: Readonly<Record<BillingPlanTier, ManagedUsageLimit>> =
  Object.freeze({
    'local-only': NO_MANAGED_USAGE,
    byok: NO_MANAGED_USAGE,
    free: {
      monthlyCredits: 20,
      weeklyCredits: 15,
      fiveHourCredits: 2,
      dailyCredits: 0,
      unlimited: false,
    },
    basic: {
      monthlyCredits: 400,
      weeklyCredits: 100,
      fiveHourCredits: 10,
      dailyCredits: 0,
      unlimited: false,
    },
    pro: {
      monthlyCredits: 2_000,
      weeklyCredits: 500,
      fiveHourCredits: 50,
      dailyCredits: 0,
      unlimited: false,
    },
    max: {
      monthlyCredits: 10_000,
      weeklyCredits: 2_500,
      fiveHourCredits: 250,
      dailyCredits: 0,
      unlimited: false,
    },
    max_15x: {
      monthlyCredits: 20_000,
      weeklyCredits: 5_000,
      fiveHourCredits: 1_000,
      dailyCredits: 0,
      unlimited: false,
    },
    team: {
      monthlyCredits: 2_000,
      weeklyCredits: 500,
      fiveHourCredits: 50,
      dailyCredits: 0,
      unlimited: false,
    },
    enterprise: { ...NO_MANAGED_USAGE, unlimited: true },
  });

export type ManagedUsageLimitTable = Readonly<Record<BillingPlanTier, ManagedUsageLimit>>;

export const MANAGED_USAGE_LIMITS_BY_CATALOG_VERSION: Readonly<
  Record<number, ManagedUsageLimitTable>
> = Object.freeze({ [BILLING_PLAN_CATALOG_VERSION]: MANAGED_USAGE_LIMITS });

export function resolvePlanCatalogVersion(value: unknown): number | null {
  const version = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof version === 'number' &&
    Number.isSafeInteger(version) &&
    Object.prototype.hasOwnProperty.call(MANAGED_USAGE_LIMITS_BY_CATALOG_VERSION, version)
    ? version
    : null;
}

export function managedUsageLimitsForCatalogVersion(
  catalogVersion: number | null | undefined,
): ManagedUsageLimitTable {
  const version = resolvePlanCatalogVersion(catalogVersion);
  return (
    (version === null ? undefined : MANAGED_USAGE_LIMITS_BY_CATALOG_VERSION[version]) ??
    MANAGED_USAGE_LIMITS
  );
}

export interface ManagedUsageWindowMultipliers {
  fiveHour: number;
  weekly: number;
  monthly: number;
}

export function managedUsageMultipliers(
  tier: BillingPlanTier,
  baseline: BillingPlanTier,
): ManagedUsageWindowMultipliers | null {
  const subject = MANAGED_USAGE_LIMITS[tier];
  const against = MANAGED_USAGE_LIMITS[baseline];
  if (!subject || !against || subject.unlimited || against.unlimited) return null;
  if (against.monthlyCredits <= 0 || against.weeklyCredits <= 0 || against.fiveHourCredits <= 0) {
    return null;
  }
  const multipliers = {
    fiveHour: subject.fiveHourCredits / against.fiveHourCredits,
    weekly: subject.weeklyCredits / against.weeklyCredits,
    monthly: subject.monthlyCredits / against.monthlyCredits,
  };
  const whole = Object.values(multipliers).every((ratio) => Number.isInteger(ratio) && ratio >= 1);
  return whole ? multipliers : null;
}

export function managedUsageMultiplier(
  tier: BillingPlanTier,
  baseline: BillingPlanTier,
): number | null {
  const multipliers = managedUsageMultipliers(tier, baseline);
  if (!multipliers) return null;
  const { fiveHour, weekly, monthly } = multipliers;
  return fiveHour === weekly && weekly === monthly ? fiveHour : null;
}

export function managedUsageComparisonLabel(
  tier: BillingPlanTier,
  baseline: BillingPlanTier,
  baselineLabel: string,
): string | null {
  const multipliers = managedUsageMultipliers(tier, baseline);
  if (!multipliers) return null;
  const { fiveHour, weekly, monthly } = multipliers;
  if (fiveHour === weekly && weekly === monthly) {
    return fiveHour === 1
      ? `Same usage as ${baselineLabel}`
      : `${fiveHour}x more usage than ${baselineLabel}`;
  }
  if (weekly === monthly) {
    return `${fiveHour}x ${baselineLabel} per 5 hours, ${weekly}x per week`;
  }
  return `${fiveHour}x ${baselineLabel} per 5 hours, ${weekly}x per week, ${monthly}x per month`;
}

export interface PlanCreditAllowance {
  monthly: number;
  weekly: number;
  fiveHour: number;
  flagshipWeekly: number | null;
  unlimited: boolean;
}

function hasFlagshipWeeklyAllowance(tier: BillingPlanTier): boolean {
  return (
    isProPlanTier(tier) ||
    isMaxPlanTier(tier) ||
    isMax15xPlanTier(tier) ||
    isPerSeatBillingPlan(tier)
  );
}

function buildPlanCreditAllowance(
  tier: BillingPlanTier,
  limits: ManagedUsageLimitTable = MANAGED_USAGE_LIMITS,
): PlanCreditAllowance {
  const limit = limits[tier];
  if (limit.unlimited) {
    return {
      monthly: Infinity,
      weekly: Infinity,
      fiveHour: Infinity,
      flagshipWeekly: null,
      unlimited: true,
    };
  }
  return {
    monthly: limit.monthlyCredits,
    weekly: limit.weeklyCredits,
    fiveHour: limit.fiveHourCredits,
    flagshipWeekly: hasFlagshipWeeklyAllowance(tier)
      ? limit.weeklyCredits * FLAGSHIP_OF_WEEKLY_BUDGET_RATIO
      : null,
    unlimited: false,
  };
}

export const PLAN_CREDIT_ALLOWANCES: Readonly<Record<BillingPlanTier, PlanCreditAllowance>> =
  Object.freeze(
    Object.fromEntries(
      (Object.keys(MANAGED_USAGE_LIMITS) as BillingPlanTier[]).map((tier) => [
        tier,
        buildPlanCreditAllowance(tier),
      ]),
    ) as Record<BillingPlanTier, PlanCreditAllowance>,
  );

export function getPlanCreditAllowance(
  tier: BillingPlanTier,
  catalogVersion?: number | null,
): PlanCreditAllowance {
  const limits = managedUsageLimitsForCatalogVersion(catalogVersion);
  return limits === MANAGED_USAGE_LIMITS
    ? PLAN_CREDIT_ALLOWANCES[tier]
    : buildPlanCreditAllowance(tier, limits);
}
