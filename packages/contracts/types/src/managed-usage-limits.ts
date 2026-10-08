import {
  BILLING_PLAN_PRICING,
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
    team_premium: {
      monthlyCredits: 10_000,
      weeklyCredits: 2_500,
      fiveHourCredits: 250,
      dailyCredits: 0,
      unlimited: false,
    },
    enterprise: { ...NO_MANAGED_USAGE, unlimited: true },
  });

export type ManagedUsageLimitTable = Readonly<Record<BillingPlanTier, ManagedUsageLimit>>;

export const MANAGED_USAGE_LIMITS_BY_CATALOG_VERSION: Readonly<
  Record<number, ManagedUsageLimitTable>
> = Object.freeze({
  1: MANAGED_USAGE_LIMITS,
  2: MANAGED_USAGE_LIMITS,
  [BILLING_PLAN_CATALOG_VERSION]: MANAGED_USAGE_LIMITS,
});

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

function managedUsageRatios(
  tier: BillingPlanTier,
  baseline: BillingPlanTier,
): ManagedUsageWindowMultipliers | null {
  const subject = MANAGED_USAGE_LIMITS[tier];
  const against = MANAGED_USAGE_LIMITS[baseline];
  if (!subject || !against || subject.unlimited || against.unlimited) return null;
  if (against.monthlyCredits <= 0 || against.weeklyCredits <= 0 || against.fiveHourCredits <= 0) {
    return null;
  }
  return {
    fiveHour: subject.fiveHourCredits / against.fiveHourCredits,
    weekly: subject.weeklyCredits / against.weeklyCredits,
    monthly: subject.monthlyCredits / against.monthlyCredits,
  };
}

export function managedUsageMultipliers(
  tier: BillingPlanTier,
  baseline: BillingPlanTier,
): ManagedUsageWindowMultipliers | null {
  const ratios = managedUsageRatios(tier, baseline);
  if (!ratios) return null;
  const whole = Object.values(ratios).every((ratio) => Number.isInteger(ratio) && ratio >= 1);
  return whole ? ratios : null;
}

export const MANAGED_USAGE_BASELINES: Readonly<Partial<Record<BillingPlanTier, BillingPlanTier>>> =
  Object.freeze({
    basic: 'free',
    pro: 'basic',
    max: 'pro',
    max_15x: 'pro',
    team: 'pro',
    team_premium: 'team',
  });

export interface ManagedUsageComparison {
  baseline: BillingPlanTier;
  perSeat: boolean;
  factor: number | null;
  session: number | null;
  weekly: number | null;
}

function moreUsageMultiple(ratio: number): number | null {
  return Number.isInteger(ratio) && ratio > 1 ? ratio : null;
}

export function compareManagedUsage(
  tier: BillingPlanTier,
  baseline: BillingPlanTier | undefined = MANAGED_USAGE_BASELINES[tier],
): ManagedUsageComparison | null {
  if (!baseline) return null;
  const ratios = managedUsageRatios(tier, baseline);
  if (!ratios) return null;
  const perSeat = isPerSeatBillingPlan(tier);
  const { fiveHour, weekly, monthly } = ratios;
  if (fiveHour === weekly && weekly === monthly && Number.isInteger(fiveHour) && fiveHour >= 1) {
    return { baseline, perSeat, factor: fiveHour, session: null, weekly: null };
  }
  const session = moreUsageMultiple(fiveHour);
  const weeklyMultiple = moreUsageMultiple(weekly);
  if (session === null && weeklyMultiple === null) return null;
  return { baseline, perSeat, factor: null, session, weekly: weeklyMultiple };
}

export function managedUsageComparisonLines(
  tier: BillingPlanTier,
  baseline?: BillingPlanTier,
): string[] {
  const comparison = compareManagedUsage(tier, baseline);
  if (!comparison) return [];
  const against = BILLING_PLAN_PRICING[comparison.baseline].label;
  const seat = comparison.perSeat ? ' for every seat' : '';
  if (comparison.factor === 1) return [`Same usage as ${against}${seat}`];
  if (comparison.factor !== null)
    return [`${comparison.factor}x more usage than ${against}${seat}`];
  return [
    ...(comparison.session === null
      ? []
      : [`${comparison.session}x more usage per session than ${against}${seat}`]),
    ...(comparison.weekly === null
      ? []
      : [`${comparison.weekly}x more weekly usage than ${against}${seat}`]),
  ];
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
  const comparison = compareManagedUsage(tier, baseline);
  if (!comparison) return null;
  const { factor, session, weekly } = comparison;
  if (factor === 1) return `Same usage as ${baselineLabel}`;
  if (factor !== null) return `${factor}x more usage than ${baselineLabel}`;
  if (session !== null && weekly !== null) {
    return `${session}x more usage per session and ${weekly}x more weekly usage than ${baselineLabel}`;
  }
  return session !== null
    ? `${session}x more usage per session than ${baselineLabel}`
    : `${weekly}x more weekly usage than ${baselineLabel}`;
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
