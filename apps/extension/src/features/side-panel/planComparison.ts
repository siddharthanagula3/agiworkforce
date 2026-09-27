import {
  BILLING_PLAN_CAPABILITY_LABELS,
  PLAN_CREDIT_ALLOWANCES,
  SELF_SERVE_PAID_PLAN_TIERS,
  billingPlanCapabilities,
  billingPlanCapabilitiesAddedOver,
  creditAmount,
  getBillingPlanPricing,
  isBillingPlanTier,
  isFreeBillingPlanTier,
  isPerSeatBillingPlan,
  type BillingPlanCapability,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { t } from '../../i18n';

const COMPARED_PLANS: readonly BillingPlanTier[] = [
  'free',
  ...SELF_SERVE_PAID_PLAN_TIERS,
  'enterprise',
];

export interface PlanComparisonView {
  label: string;
  current: boolean;
  credits: string;
  features: string;
}

function capabilityList(capabilities: readonly BillingPlanCapability[]): string {
  return capabilities.map((capability) => BILLING_PLAN_CAPABILITY_LABELS[capability]).join(', ');
}

function creditsPhrase(plan: BillingPlanTier): string {
  const allowance = PLAN_CREDIT_ALLOWANCES[plan];
  if (allowance.unlimited) return t('spPlansContract');
  const amounts = [
    creditAmount(allowance.fiveHour),
    creditAmount(allowance.weekly),
    creditAmount(allowance.monthly),
  ];
  if (isFreeBillingPlanTier(plan)) return t('spPlansCreditsFree', amounts);
  return isPerSeatBillingPlan(plan)
    ? t('spPlansCreditsPerSeat', amounts)
    : t('spPlansCredits', amounts);
}

export function planComparisonViews(currentPlan: string | null | undefined): PlanComparisonView[] {
  const current =
    currentPlan && isBillingPlanTier(currentPlan) && COMPARED_PLANS.includes(currentPlan)
      ? currentPlan
      : null;
  return COMPARED_PLANS.map((plan) => {
    const isCurrent = plan === current;
    const label = getBillingPlanPricing(plan).label;
    let features: string;
    if (current === null || isCurrent) {
      features = t('spPlansIncludes', [capabilityList(billingPlanCapabilities(plan))]);
    } else {
      const added = billingPlanCapabilitiesAddedOver(plan, current);
      const currentLabel = getBillingPlanPricing(current).label;
      features =
        added.length === 0
          ? t('spPlansNothingMore', [currentLabel])
          : t('spPlansAdds', [currentLabel, capabilityList(added)]);
    }
    return {
      label: isCurrent ? t('spPlansYourPlan', [label]) : label,
      current: isCurrent,
      credits: creditsPhrase(plan),
      features,
    };
  });
}
