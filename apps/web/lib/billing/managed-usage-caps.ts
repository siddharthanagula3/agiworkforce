import type { BillingPlanTier } from '@agiworkforce/types';

export interface ManagedUsageLimit {
  monthlyUnits: number;
  weeklyUnits: number;
  fiveHourUnits: number;
  dailyUnits: number;
  unlimited: boolean;
}

export const MANAGED_USAGE_LIMITS: Readonly<Record<BillingPlanTier, ManagedUsageLimit>> =
  Object.freeze({
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

/**
 * The only source a published "Nx more usage" claim may be built from. A
 * hand-typed multiplier is falsifiable the moment the table above moves; this
 * returns null rather than a number whenever the comparison is not a clean
 * whole multiple, so no surface can round a claim into being true.
 */
export function managedUsageMultiplier(
  tier: BillingPlanTier,
  baseline: BillingPlanTier,
): number | null {
  const subject = MANAGED_USAGE_LIMITS[tier];
  const against = MANAGED_USAGE_LIMITS[baseline];
  if (!subject || !against) return null;
  if (subject.unlimited || against.unlimited) return null;
  if (against.monthlyUnits <= 0) return null;

  const ratios = [
    subject.monthlyUnits / against.monthlyUnits,
    subject.weeklyUnits / against.weeklyUnits,
    subject.fiveHourUnits / against.fiveHourUnits,
  ];
  const [first] = ratios;
  if (first === undefined || !Number.isInteger(first) || first < 1) return null;
  return ratios.every((ratio) => ratio === first) ? first : null;
}

export function managedUsageComparisonLabel(
  tier: BillingPlanTier,
  baseline: BillingPlanTier,
  baselineLabel: string,
): string | null {
  const multiplier = managedUsageMultiplier(tier, baseline);
  if (multiplier === null) return null;
  if (multiplier === 1) return `Same usage as ${baselineLabel}`;
  return `${multiplier}x more usage than ${baselineLabel}`;
}
