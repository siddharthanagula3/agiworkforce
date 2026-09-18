import 'server-only';

import {
  BILLING_PLAN_CATALOG_VERSION,
  isPlanOnSale,
  listPlanCatalog,
  listPlansForProduct,
  normalizeBillingPlanTier,
  planCatalogEntry,
  resolveGrandfatheredPlan,
  resolvePurchasablePlan,
  toEntitlement,
  toProduct,
  type BillingPlanTier,
  type Entitlement,
  type Plan,
  type PlanCatalogEntry,
  type Product,
} from '@agiworkforce/types';

export interface CatalogOffer {
  product: Product;
  catalog: PlanCatalogEntry;
  plans: Plan[];
  entitlement: Entitlement;
}

export interface SubscriberPlanResolution {
  soldAs: BillingPlanTier;
  effective: BillingPlanTier;
  grandfathered: boolean;
  catalogVersion: number;
  soldUnderCatalogVersion: number;
  repriced: boolean;
}

/**
 * Everything the checkout and pricing surfaces need about one plan, assembled
 * from the catalog on each call. A surface that adds a plan therefore adds
 * nothing: the plan appears here as soon as it is in the catalog.
 */
export function catalogOffer(tier: string | null | undefined): CatalogOffer {
  const normalized = normalizeBillingPlanTier(tier);
  return {
    product: toProduct(normalized),
    catalog: planCatalogEntry(normalized),
    plans: listPlansForProduct(normalized),
    entitlement: toEntitlement(normalized),
  };
}

export function listCatalogOffers(): CatalogOffer[] {
  return listPlanCatalog().map((entry) => catalogOffer(entry.tier));
}

export function listPurchasableOffers(): CatalogOffer[] {
  return listCatalogOffers().filter((offer) => isPlanOnSale(offer.catalog.tier));
}

/**
 * What a buyer actually gets when they ask for a plan. A withdrawn plan sends
 * them to its successor; a contract-priced plan sends them to sales, which is
 * why this answers null rather than substituting something sellable.
 */
export function resolveCheckoutPlan(tier: string | null | undefined): BillingPlanTier | null {
  return resolvePurchasablePlan(tier);
}

/**
 * What an existing subscriber keeps. `soldUnderCatalogVersion` comes from the
 * subscription row, so a customer bought under an older catalog is visible here
 * rather than being silently read as a customer on today's terms.
 */
export function resolveSubscriberPlan(input: {
  tier: string | null | undefined;
  soldUnderCatalogVersion: number | null;
}): SubscriberPlanResolution {
  const soldAs = normalizeBillingPlanTier(input.tier);
  const entry = planCatalogEntry(soldAs);
  const soldUnder = input.soldUnderCatalogVersion ?? BILLING_PLAN_CATALOG_VERSION;
  return {
    soldAs,
    effective: resolveGrandfatheredPlan(soldAs),
    grandfathered: entry.sellability === 'withdrawn',
    catalogVersion: BILLING_PLAN_CATALOG_VERSION,
    soldUnderCatalogVersion: soldUnder,
    repriced: soldUnder !== BILLING_PLAN_CATALOG_VERSION,
  };
}
