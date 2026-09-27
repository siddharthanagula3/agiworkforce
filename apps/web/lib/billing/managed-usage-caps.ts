import type { BillingPlanTier } from '@agiworkforce/types';

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
