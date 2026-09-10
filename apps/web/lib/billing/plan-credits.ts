import 'server-only';

import type { BillingPlanTier } from '@agiworkforce/types';
import {
  creditsFromMicrousd,
  isMax15xPlanTier,
  isMaxPlanTier,
  isPerSeatBillingPlan,
  isProPlanTier,
} from '@agiworkforce/types';
import { MANAGED_USAGE_LIMITS } from '@/lib/billing/managed-usage-caps';
import {
  FLAGSHIP_OF_WEEKLY_BUDGET_RATIO,
  getInternalUsageUnitMicrousd,
} from '@/lib/server/managed-usage-policy';

function hasFlagshipWeeklyAllowance(tier: BillingPlanTier): boolean {
  return (
    isProPlanTier(tier) ||
    isMaxPlanTier(tier) ||
    isMax15xPlanTier(tier) ||
    isPerSeatBillingPlan(tier)
  );
}

export interface PlanCreditAllowance {
  monthly: number;
  weekly: number;
  fiveHour: number;
  flagshipWeekly: number | null;
  unlimited: boolean;
}

function unitsToCredits(units: number): number {
  return creditsFromMicrousd(units * getInternalUsageUnitMicrousd());
}

function buildAllowance(tier: BillingPlanTier): PlanCreditAllowance {
  const limit = MANAGED_USAGE_LIMITS[tier];
  if (limit.unlimited) {
    return {
      monthly: Infinity,
      weekly: Infinity,
      fiveHour: Infinity,
      flagshipWeekly: null,
      unlimited: true,
    };
  }
  const weekly = unitsToCredits(limit.weeklyUnits);
  return {
    monthly: unitsToCredits(limit.monthlyUnits),
    weekly,
    fiveHour: unitsToCredits(limit.fiveHourUnits),
    flagshipWeekly: hasFlagshipWeeklyAllowance(tier)
      ? weekly * FLAGSHIP_OF_WEEKLY_BUDGET_RATIO
      : null,
    unlimited: false,
  };
}

export const PLAN_CREDIT_ALLOWANCES: Readonly<Record<BillingPlanTier, PlanCreditAllowance>> =
  Object.freeze(
    Object.fromEntries(
      (Object.keys(MANAGED_USAGE_LIMITS) as BillingPlanTier[]).map((tier) => [
        tier,
        buildAllowance(tier),
      ]),
    ) as Record<BillingPlanTier, PlanCreditAllowance>,
  );

export function getPlanCreditAllowance(tier: BillingPlanTier): PlanCreditAllowance {
  return PLAN_CREDIT_ALLOWANCES[tier];
}
