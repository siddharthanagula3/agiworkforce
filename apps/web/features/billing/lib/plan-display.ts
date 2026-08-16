import {
  canUseBillingPlanCapability,
  getBillingPlanPricing,
  getBillingPlanProductLimits,
  getPlanPriceUsd,
  type BillingPlanLimit,
  type BillingPlanPricing,
  type BillingPlanTier,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';

export type SelectablePaidPlan = SelfServePaidPlanTier;
export type DisplayPaidPlan = SelectablePaidPlan | 'team';

export const WEB_PAID_PLAN_ORDER: readonly SelectablePaidPlan[] = [
  'basic',
  'pro',
  'max',
  'max_15x',
];

function limitLabel(limit: BillingPlanLimit, singular: string, plural: string): string {
  if (limit === 'unlimited') return `Unlimited ${plural}`;
  if (limit === 'custom') return `Custom ${singular} limit`;
  return `${String(limit)} ${limit === 1 ? singular : plural}`;
}

export interface BillingPlanDisplay {
  pricing: BillingPlanPricing;
  monthlyPriceUsd: number | null;
  yearlyPriceUsd: number | null;
  annualAvailable: boolean;
  features: string[];
}

export function getBillingPlanDisplay(plan: BillingPlanTier): BillingPlanDisplay {
  const pricing = getBillingPlanPricing(plan);
  const monthlyPriceUsd = getPlanPriceUsd(plan, 'monthly');
  const yearlyPriceUsd = getPlanPriceUsd(plan, 'yearly');
  const limits = getBillingPlanProductLimits(plan);
  const features: string[] = [];

  if (canUseBillingPlanCapability(plan, 'managed_chat')) features.push('Managed chat and tools');
  if (limits) {
    features.push(limitLabel(limits.projects, 'project', 'projects'));
    features.push(limitLabel(limits.customMcpServers, 'custom MCP server', 'custom MCP servers'));
  }
  if (canUseBillingPlanCapability(plan, 'skills_connectors')) {
    features.push('Skills and connectors');
  }
  if (canUseBillingPlanCapability(plan, 'agi_work')) features.push('AGI Work');
  if (canUseBillingPlanCapability(plan, 'image_generation')) features.push('Image generation');
  if (canUseBillingPlanCapability(plan, 'video_generation')) features.push('Video generation');
  if (canUseBillingPlanCapability(plan, 'developer_surfaces')) {
    features.push('Managed CLI, Chrome, and VS Code access');
  }
  if (canUseBillingPlanCapability(plan, 'team_admin')) features.push('Team administration');
  if (canUseBillingPlanCapability(plan, 'enterprise_controls')) {
    features.push('Enterprise controls');
  }

  return {
    pricing,
    monthlyPriceUsd,
    yearlyPriceUsd,
    annualAvailable: yearlyPriceUsd !== null && yearlyPriceUsd > 0,
    features,
  };
}

export function formatCatalogPrice(amountUsd: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountUsd);
}
