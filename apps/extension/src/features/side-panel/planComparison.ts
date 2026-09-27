import {
  BILLING_PLAN_CAPABILITY_LABELS,
  PLAN_CREDIT_ALLOWANCES,
  SELF_SERVE_PAID_PLAN_TIERS,
  billingPlanCapabilities,
  billingPlanCapabilitiesAddedOver,
  getBillingPlanPricing,
  isBillingPlanTier,
  isFreeBillingPlanTier,
  managedUsageComparisonLines,
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
  usage: string;
  features: string;
}

function capabilityList(capabilities: readonly BillingPlanCapability[]): string {
  return capabilities.map((capability) => BILLING_PLAN_CAPABILITY_LABELS[capability]).join(', ');
}

function usagePhrase(plan: BillingPlanTier): string {
  if (PLAN_CREDIT_ALLOWANCES[plan].unlimited) return t('spPlansContract');
  if (isFreeBillingPlanTier(plan)) return t('spPlansFreeUsage');
  return managedUsageComparisonLines(plan).join(', ');
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
      usage: usagePhrase(plan),
      features,
    };
  });
}
