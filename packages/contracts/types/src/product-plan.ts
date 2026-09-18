import {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  BILLING_PLAN_PRODUCT_LIMITS,
  SELF_SERVE_PAID_PLAN_TIERS,
  getBillingPlanPricing,
  getPlanPriceCents,
  getPlanPriceInr,
  getPlanTrialDays,
  isBillingPlanTier,
  isContractPricedPlan,
  isPerSeatBillingPlan,
  normalizeBillingPlanTier,
  type BillingInterval,
  type BillingPlanCapability,
  type BillingPlanProductLimits,
  type BillingPlanTier,
} from './billing-catalog';

/**
 * The canonical names for the commercial objects the catalog already models.
 * Every value here is derived from `billing-catalog.ts` on each call, so this
 * layer renames the source of truth rather than copying it.
 */

export type ProductId = BillingPlanTier;

export type ProductAudience = 'local' | 'individual' | 'workspace' | 'enterprise';

export type PlanCurrency = 'usd' | 'inr';

export interface Product {
  id: ProductId;
  label: string;
  audience: ProductAudience;
  selfServeSellable: boolean;
  contractPriced: boolean;
  perSeat: boolean;
}

export interface Plan {
  productId: ProductId;
  interval: BillingInterval;
  currency: PlanCurrency;
  priceMinorUnits: number;
  perSeat: boolean;
  trialDays: number | null;
}

export interface Entitlement {
  productId: ProductId;
  capabilities: readonly BillingPlanCapability[];
  limits: BillingPlanProductLimits;
}

/**
 * The credit account as `token_credits` and `credit_transactions` hold it
 * (0182). Amounts are microUSD integers: a credit is an allocation of spend,
 * not a currency, and rounding it to cents at rest is how a balance drifts.
 */
export interface CreditLedgerBalance {
  subjectId: string;
  allocatedMicroUsd: number;
  usedMicroUsd: number;
  topUpAllocatedMicroUsd: number;
  flagshipUsedTodayMicroUsd: number;
}

export type CreditLedgerEntryKind = 'allocation' | 'consumption' | 'top_up' | 'refund' | 'expiry';

export interface CreditLedgerEntry {
  id: string;
  subjectId: string;
  kind: CreditLedgerEntryKind;
  amountMicroUsd: number;
  idempotencyKey: string | null;
  occurredAt: string;
}

export interface CreditLedger {
  balance: CreditLedgerBalance;
  entries: readonly CreditLedgerEntry[];
}

export function creditLedgerRemainingMicroUsd(balance: CreditLedgerBalance): number {
  return Math.max(
    0,
    balance.allocatedMicroUsd + balance.topUpAllocatedMicroUsd - balance.usedMicroUsd,
  );
}

const PRODUCT_AUDIENCE: Readonly<Record<ProductId, ProductAudience>> = Object.freeze({
  'local-only': 'local',
  byok: 'local',
  free: 'individual',
  basic: 'individual',
  pro: 'individual',
  max: 'individual',
  max_15x: 'individual',
  team: 'workspace',
  enterprise: 'enterprise',
});

export function toProduct(productId: string | null | undefined): Product {
  const id = normalizeBillingPlanTier(productId);
  return {
    id,
    label: getBillingPlanPricing(id).label,
    audience: PRODUCT_AUDIENCE[id],
    selfServeSellable: (SELF_SERVE_PAID_PLAN_TIERS as readonly string[]).includes(id),
    contractPriced: isContractPricedPlan(id),
    perSeat: isPerSeatBillingPlan(id),
  };
}

export function listProducts(): Product[] {
  return (Object.keys(BILLING_PLAN_PRICING) as ProductId[]).map(toProduct);
}

/**
 * The priced configurations of one product. A contract-priced product has no
 * plan here on purpose: its price lives in the signed order form, not in the
 * public catalog, and inventing a zero would publish a price that is not real.
 */
export function listPlansForProduct(productId: string | null | undefined): Plan[] {
  const id = normalizeBillingPlanTier(productId);
  if (isContractPricedPlan(id)) return [];

  const perSeat = isPerSeatBillingPlan(id);
  const trialDays = getPlanTrialDays(id);
  const plans: Plan[] = [];
  for (const interval of ['monthly', 'yearly'] as const) {
    const priceMinorUnits = getPlanPriceCents(id, interval);
    if (priceMinorUnits === null) continue;
    if (interval === 'yearly' && priceMinorUnits === 0 && getPlanPriceCents(id, 'monthly') !== 0) {
      continue;
    }
    plans.push({ productId: id, interval, currency: 'usd', priceMinorUnits, perSeat, trialDays });
  }

  const monthlyInr = getPlanPriceInr(id);
  if (monthlyInr !== null) {
    plans.push({
      productId: id,
      interval: 'monthly',
      currency: 'inr',
      priceMinorUnits: Math.round(monthlyInr * 100),
      perSeat,
      trialDays,
    });
  }
  return plans;
}

export function listPlans(): Plan[] {
  return listProducts().flatMap((product) => listPlansForProduct(product.id));
}

export function toEntitlement(productId: string | null | undefined): Entitlement {
  const id = normalizeBillingPlanTier(productId);
  const capabilities = (Object.keys(BILLING_PLAN_CAPABILITY_TIERS) as BillingPlanCapability[])
    .filter((capability) => BILLING_PLAN_CAPABILITY_TIERS[capability].includes(id))
    .sort();
  return { productId: id, capabilities, limits: BILLING_PLAN_PRODUCT_LIMITS[id] };
}

export function entitlementGrants(
  entitlement: Entitlement,
  capability: BillingPlanCapability,
): boolean {
  return entitlement.capabilities.includes(capability);
}

export function isProductId(value: string | null | undefined): value is ProductId {
  return isBillingPlanTier(value);
}
