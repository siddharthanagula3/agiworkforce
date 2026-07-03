/**
 * In-app purchase product catalog — StoreKit 2 (iOS) / Play Billing (Android).
 *
 * All SKU strings below are PLACEHOLDERS. They do not exist in App Store Connect
 * or Google Play Console yet — creating the real products requires the founder's
 * own store-console access, which this scaffolding does not have. Swap every
 * `TODO` SKU for the real one once it's created, then delete this comment block.
 *
 * Tier set mirrors `BILLING_PLAN_PRICING` in `@agiworkforce/types` (billing-catalog.ts):
 * basic (monthly only), pro (monthly + yearly), max (monthly only), team (monthly + yearly).
 * `free`, `local-only`, `byok`, and `enterprise` are not purchasable in-app.
 */
import type { BillingInterval, BillingPlanTier } from '@agiworkforce/types';

export type PurchasableTier = Extract<BillingPlanTier, 'basic' | 'pro' | 'max' | 'team'>;

const PURCHASABLE_TIERS: ReadonlySet<BillingPlanTier> = new Set<BillingPlanTier>([
  'basic',
  'pro',
  'max',
  'team',
]);

export function isPurchasableTier(tier: BillingPlanTier): tier is PurchasableTier {
  return PURCHASABLE_TIERS.has(tier);
}

/** Tiers that offer a yearly interval. `basic` and `max` are monthly-only today. */
export const YEARLY_AVAILABLE_TIERS: ReadonlySet<PurchasableTier> = new Set(['pro', 'team']);

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
  team: {
    monthly: {
      ios: 'com.agiworkforce.app.sub.team.monthly',
      android: 'sub_team_monthly',
    },
    yearly: {
      ios: 'com.agiworkforce.app.sub.team.yearly',
      android: 'sub_team_yearly',
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
