/**
 * Server-side mirror of apps/mobile/src/features/billing/iapProducts.ts's
 * `IAP_PRODUCTS` catalog.
 *
 * Apps are separate build targets (not shared packages), so the mobile
 * client's App Store Connect / Play Console product-id table can't be
 * imported directly here. This copy must be kept in sync by hand whenever
 * the mobile catalog changes — flagged as a follow-up to hoist into a
 * shared package (e.g. packages/contracts/types) so both sides read one source of
 * truth instead of two hand-maintained literals.
 *
 * All product ids below are the same placeholders as the mobile file: they
 * don't exist in App Store Connect / Google Play Console yet.
 */
import { SELF_SERVE_PAID_PLAN_TIERS, type BillingInterval } from '@agiworkforce/types';

// Canonical self-serve set (basic, pro, max, max_15x). Team is EXCLUDED — it is
// sales-assisted, so an IAP receipt must never self-activate it here.
export type PurchasableTier = (typeof SELF_SERVE_PAID_PLAN_TIERS)[number];

interface IapProductId {
  ios: string;
  android: string;
}

type IapProductCatalog = Record<PurchasableTier, Partial<Record<BillingInterval, IapProductId>>>;

export const IAP_PRODUCTS: IapProductCatalog = {
  basic: {
    monthly: {
      ios: 'com.agiworkforce.app.sub.basic.monthly',
      android: 'sub_basic_monthly',
    },
  },
  pro: {
    monthly: {
      ios: 'com.agiworkforce.app.sub.pro.monthly',
      android: 'sub_pro_monthly',
    },
    yearly: {
      ios: 'com.agiworkforce.app.sub.pro.yearly',
      android: 'sub_pro_yearly',
    },
  },
  max: {
    monthly: {
      ios: 'com.agiworkforce.app.sub.max.monthly',
      android: 'sub_max_monthly',
    },
  },
  max_15x: {
    monthly: {
      ios: 'com.agiworkforce.app.sub.max15x.monthly',
      android: 'sub_max15x_monthly',
    },
  },
};

/** Reverse lookup: platform product id -> { tier, interval, planTier }. */
export function resolveTierFromProductId(
  productId: string,
  platform: 'ios' | 'android',
): { tier: PurchasableTier; interval: BillingInterval } | null {
  for (const [tier, intervals] of Object.entries(IAP_PRODUCTS) as [
    PurchasableTier,
    Partial<Record<BillingInterval, IapProductId>>,
  ][]) {
    for (const [interval, product] of Object.entries(intervals) as [
      BillingInterval,
      IapProductId,
    ][]) {
      if (product[platform] === productId) return { tier, interval };
    }
  }
  return null;
}

/** Sanity check that a tier is a canonical self-serve tier with a catalog entry. */
export function isKnownPurchasableTier(tier: string): tier is PurchasableTier {
  return (SELF_SERVE_PAID_PLAN_TIERS as readonly string[]).includes(tier) && tier in IAP_PRODUCTS;
}
