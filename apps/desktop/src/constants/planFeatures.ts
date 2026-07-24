import { BILLING_PLAN_PRICING, canUseBillingPlanCapability } from '@agiworkforce/types';
import type { PlanTier } from '../lib/cloudAccountTypes';

export interface PlanFeatures {
  automationsPerDay: number | 'unlimited';
  browserAutomation: boolean;
  advancedUiAutomation: boolean;
  emailSupport: boolean;
  prioritySupport: boolean;
  teamFeatures: boolean;
  sso: boolean;
  customWorkflows: boolean;
  webhookIntegration: boolean;
  analytics: boolean;
  llmCostTracking: boolean;
}

function buildPlanFeatures(tier: PlanTier): PlanFeatures {
  const developerSurfaceAccess = canUseBillingPlanCapability(tier, 'developer_surfaces');
  const teamAdministration = canUseBillingPlanCapability(tier, 'team_admin');
  const enterpriseControls = canUseBillingPlanCapability(tier, 'enterprise_controls');
  const maxIndividualFeatures = tier === 'max' || tier === 'max_15x' || tier === 'enterprise';
  const localAutomation = tier === 'local-only' || tier === 'byok';

  return {
    automationsPerDay: localAutomation || developerSurfaceAccess ? 'unlimited' : 10,
    browserAutomation: developerSurfaceAccess,
    advancedUiAutomation: developerSurfaceAccess,
    emailSupport: developerSurfaceAccess,
    prioritySupport: maxIndividualFeatures,
    teamFeatures: teamAdministration,
    sso: enterpriseControls,
    customWorkflows: maxIndividualFeatures,
    webhookIntegration: maxIndividualFeatures,
    analytics: maxIndividualFeatures || teamAdministration,
    llmCostTracking: tier === 'byok' || developerSurfaceAccess,
  };
}

export const PLAN_FEATURES: Readonly<Record<PlanTier, PlanFeatures>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(BILLING_PLAN_PRICING) as PlanTier[]).map((tier) => [
      tier,
      buildPlanFeatures(tier),
    ]),
  ) as Record<PlanTier, PlanFeatures>,
);
