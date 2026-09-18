import {
  BILLING_PLAN_PRICING,
  SELF_SERVE_PAID_PLAN_TIERS,
  isContractPricedPlan,
  isFreeOfChargePlanTier,
  normalizeBillingPlanTier,
  type BillingPlanTier,
} from './billing-catalog';

/**
 * Bumped whenever a plan is added, withdrawn or repriced. A stored
 * subscription records the version it was sold under, so a later reprice is
 * visibly a different catalog rather than a silent rewrite of what a customer
 * agreed to.
 */
export const BILLING_PLAN_CATALOG_VERSION = 1;

export type PlanSellability = 'self_serve' | 'contract_only' | 'free_of_charge' | 'withdrawn';

export interface PlanCatalogEntry {
  tier: BillingPlanTier;
  sellability: PlanSellability;
  catalogVersion: number;
  withdrawnAt: string | null;
  successorTier: BillingPlanTier | null;
}

/**
 * Plans withdrawn from sale, with the plan a new subscriber is sent to
 * instead. An existing subscriber keeps the plan they bought: a withdrawal
 * closes the door to new sales, it does not move anyone.
 *
 * Empty today because nothing has been withdrawn. The resolution below is what
 * makes the day something is withdrawn a data change rather than a code change.
 */
export const WITHDRAWN_BILLING_PLANS: Readonly<
  Partial<Record<BillingPlanTier, { withdrawnAt: string; successorTier: BillingPlanTier | null }>>
> = Object.freeze({});

function sellabilityOf(tier: BillingPlanTier): PlanSellability {
  if (WITHDRAWN_BILLING_PLANS[tier]) return 'withdrawn';
  if (isContractPricedPlan(tier)) return 'contract_only';
  if ((SELF_SERVE_PAID_PLAN_TIERS as readonly string[]).includes(tier)) return 'self_serve';
  return 'free_of_charge';
}

export function planCatalogEntry(tier: string | null | undefined): PlanCatalogEntry {
  const normalized = normalizeBillingPlanTier(tier);
  const withdrawal = WITHDRAWN_BILLING_PLANS[normalized];
  return {
    tier: normalized,
    sellability: sellabilityOf(normalized),
    catalogVersion: BILLING_PLAN_CATALOG_VERSION,
    withdrawnAt: withdrawal?.withdrawnAt ?? null,
    successorTier: withdrawal?.successorTier ?? null,
  };
}

export function listPlanCatalog(): PlanCatalogEntry[] {
  return (Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]).map(planCatalogEntry);
}

export function isPlanOnSale(tier: string | null | undefined): boolean {
  const sellability = planCatalogEntry(tier).sellability;
  return sellability === 'self_serve' || sellability === 'free_of_charge';
}

/**
 * What a new buyer gets when they ask for a withdrawn plan: its successor, or
 * nothing when the plan was withdrawn without one.
 */
export function resolvePurchasablePlan(tier: string | null | undefined): BillingPlanTier | null {
  const entry = planCatalogEntry(tier);
  if (entry.sellability !== 'withdrawn') {
    return entry.sellability === 'contract_only' ? null : entry.tier;
  }
  return entry.successorTier === null ? null : resolvePurchasablePlan(entry.successorTier);
}

/**
 * What an existing subscriber keeps. Grandfathering is the whole point: a
 * withdrawal must never change what somebody is already paying for.
 */
export function resolveGrandfatheredPlan(tier: string | null | undefined): BillingPlanTier {
  return normalizeBillingPlanTier(tier);
}

export function isGrandfatheredSubscriber(tier: string | null | undefined): boolean {
  return planCatalogEntry(tier).sellability === 'withdrawn';
}

export const SPEND_CAP_UNLIMITED = 'unlimited';

/**
 * A spend cap is either a number of cents per period or explicitly unlimited.
 * Unlimited is a decision an administrator made, not the absence of one, which
 * is why it is a value here and not a missing row.
 */
export type SpendCap = number | typeof SPEND_CAP_UNLIMITED;

export function isUnlimitedSpendCap(cap: SpendCap): cap is typeof SPEND_CAP_UNLIMITED {
  return cap === SPEND_CAP_UNLIMITED;
}

export function normalizeSpendCap(value: unknown): SpendCap | null {
  if (value === SPEND_CAP_UNLIMITED) return SPEND_CAP_UNLIMITED;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  return null;
}

export function spendCapExceeded(cap: SpendCap, spentCents: number): boolean {
  return isUnlimitedSpendCap(cap) ? false : spentCents >= cap;
}

export function remainingSpendCents(cap: SpendCap, spentCents: number): number | null {
  return isUnlimitedSpendCap(cap) ? null : Math.max(0, cap - spentCents);
}

export function isFreePlanCatalogEntry(entry: PlanCatalogEntry): boolean {
  return isFreeOfChargePlanTier(entry.tier);
}
