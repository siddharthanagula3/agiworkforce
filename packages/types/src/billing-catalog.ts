export type BillingPlanTier =
  | 'local-only'
  | 'byok'
  | 'free'
  | 'hobby'
  | 'pro'
  | 'max'
  | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';

export const INCLUDED_USAGE_BUDGET_RATIO = 0.35;

export interface BillingPlanPricing {
  id: BillingPlanTier;
  label: string;
  monthlyPriceUsd: number;
  yearlyPriceUsd: number;
}

export const BILLING_PLAN_PRICING: Record<BillingPlanTier, BillingPlanPricing> = {
  'local-only': {
    id: 'local-only',
    label: 'Local Only',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  byok: {
    id: 'byok',
    label: 'BYOK',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  free: {
    id: 'free',
    label: 'Free',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  hobby: {
    id: 'hobby',
    label: 'Hobby',
    monthlyPriceUsd: 10,
    yearlyPriceUsd: 59.88,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    monthlyPriceUsd: 29.99,
    yearlyPriceUsd: 299.88,
  },
  max: {
    id: 'max',
    label: 'Max',
    monthlyPriceUsd: 299.99,
    yearlyPriceUsd: 2999.88,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
};

export function isBillingPlanTier(value: string | null | undefined): value is BillingPlanTier {
  if (!value) return false;
  return value in BILLING_PLAN_PRICING;
}

export function normalizeBillingPlanTier(value: string | null | undefined): BillingPlanTier {
  if (!value) return 'free';
  const normalized = value.toLowerCase();
  return isBillingPlanTier(normalized) ? normalized : 'free';
}

export function getBillingPlanPricing(plan: string | null | undefined): BillingPlanPricing {
  return BILLING_PLAN_PRICING[normalizeBillingPlanTier(plan)];
}

export function getPlanPriceUsd(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number {
  const pricing = getBillingPlanPricing(plan);
  return interval === 'yearly' ? pricing.yearlyPriceUsd : pricing.monthlyPriceUsd;
}

export function getPlanPriceCents(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number {
  return Math.round(getPlanPriceUsd(plan, interval) * 100);
}

export function getUsageBudgetCentsFromPriceCents(
  priceCents: number,
  ratio: number = INCLUDED_USAGE_BUDGET_RATIO,
): number {
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    return 0;
  }
  return Math.round(priceCents * ratio);
}

export function getPlanUsageBudgetCents(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
  ratio: number = INCLUDED_USAGE_BUDGET_RATIO,
): number {
  return getUsageBudgetCentsFromPriceCents(getPlanPriceCents(plan, interval), ratio);
}

export function getPlanUsageBudgetUsd(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
  ratio: number = INCLUDED_USAGE_BUDGET_RATIO,
): number {
  return getPlanUsageBudgetCents(plan, interval, ratio) / 100;
}
