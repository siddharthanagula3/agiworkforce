import {
  BILLING_PLAN_PRICING,
  LEGACY_BILLING_PLAN_TIER_ALIASES,
  PLAN_LABEL,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  canUseBillingPlanCapability,
  isBillingPlanTier,
} from '@agiworkforce/types';

export function planDisplayLabel(tier: string | null | undefined): string | undefined {
  const normalized = tier?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'local') return PLAN_LABEL.local;
  const canonical = LEGACY_BILLING_PLAN_TIER_ALIASES[normalized] ?? normalized;
  return isBillingPlanTier(canonical) ? BILLING_PLAN_PRICING[canonical].label : undefined;
}

export function developerAccessPlanLabel(): string | undefined {
  const tier = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.find((candidate) =>
    canUseBillingPlanCapability(candidate, 'developer_surfaces'),
  );
  return tier === undefined ? undefined : BILLING_PLAN_PRICING[tier].label;
}
