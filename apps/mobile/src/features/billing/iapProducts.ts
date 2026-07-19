/**
 * In-app purchase product catalog — StoreKit 2 (iOS) / Play Billing (Android).
 *
 * All SKU strings below are PLACEHOLDERS. They do not exist in App Store Connect
 * or Google Play Console yet — creating the real products requires the founder's
 * own store-console access, which this scaffolding does not have. Swap every
 * `TODO` SKU for the real one once it's created, then delete this comment block.
 *
 * Purchasable tier set = `SELF_SERVE_PAID_PLAN_TIERS` in `@agiworkforce/types`
 * (billing-catalog.ts), the canonical self-serve list: basic, pro, max, max_15x.
 * Team is deliberately EXCLUDED — it is sales-assisted until organization
 * billing is complete, so it must never be offered as an in-app purchase.
 * `free`, `local-only`, `byok`, and `enterprise` are not purchasable in-app.
 */
import {
  BILLING_PLAN_PRICING,
  SELF_SERVE_PAID_PLAN_TIERS,
  type BillingInterval,
  type BillingPlanTier,
} from '@agiworkforce/types';

export type PurchasableTier = (typeof SELF_SERVE_PAID_PLAN_TIERS)[number];

/**
 * Single source of truth: the canonical self-serve paid tiers. Deriving from
 * `SELF_SERVE_PAID_PLAN_TIERS` (rather than "any tier with a positive monthly
 * price") is what keeps sales-assisted Team out of the in-app purchase set.
 */
const PURCHASABLE_TIERS: ReadonlySet<BillingPlanTier> = new Set(SELF_SERVE_PAID_PLAN_TIERS);

export function isPurchasableTier(tier: BillingPlanTier): tier is PurchasableTier {
  return PURCHASABLE_TIERS.has(tier);
}

/** Self-serve tiers that also offer a yearly interval (from `BILLING_PLAN_PRICING`). */
export const YEARLY_AVAILABLE_TIERS: ReadonlySet<PurchasableTier> = new Set(
  SELF_SERVE_PAID_PLAN_TIERS.filter((tier) => BILLING_PLAN_PRICING[tier].yearlyPriceUsd > 0),
);

interface IapProductId {
  /** App Store Connect product/subscription identifier. */
  ios: string;
  /** Google Play Console product/subscription identifier (base plan id for subs). */
  android: string;
}

type IapProductCatalog = Record<PurchasableTier, Partial<Record<BillingInterval, IapProductId>>>;

/**
 * TODO: replace every value below with the real App Store Connect / Play
 * Console product ID once the founder creates them. Convention assumed here
 * (not yet verified against a real console): `com.agiworkforce.app.sub.<tier>.<interval>`.
 */
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

/** Every SKU this app can request — used to fetch product/subscription metadata up front. */
export function getAllIapSkus(platform: 'ios' | 'android'): string[] {
  const skus: string[] = [];
  for (const intervals of Object.values(IAP_PRODUCTS)) {
    for (const product of Object.values(intervals)) {
      if (product) skus.push(product[platform]);
    }
  }
  return skus;
}

export function getIapProductId(
  tier: PurchasableTier,
  interval: BillingInterval,
  platform: 'ios' | 'android',
): string | null {
  return IAP_PRODUCTS[tier]?.[interval]?.[platform] ?? null;
}

/** Reverse lookup: SKU -> { tier, interval }, used when a purchase event arrives. */
export function resolveTierFromSku(
  sku: string,
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
      if (product[platform] === sku) return { tier, interval };
    }
  }
  return null;
}
