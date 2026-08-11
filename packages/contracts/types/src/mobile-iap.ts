import {
  BILLING_PLAN_PRICING,
  type BillingInterval,
  type SelfServeIndividualPlanTier,
} from './billing-catalog';
import { TOP_UP_PRESET_AMOUNTS_USD, topUpUnitsForUsd } from './billing-topups';

export type MobileIapPlatform = 'ios' | 'android';
export type MobileIapProductKind = 'subscription' | 'top_up';

export const MOBILE_IAP_SUBSCRIPTION_PRODUCT_KEYS = [
  'subscription_basic_monthly',
  'subscription_pro_monthly',
  'subscription_pro_yearly',
  'subscription_max_monthly',
  'subscription_max_15x_monthly',
] as const;

export const MOBILE_IAP_TOP_UP_PRODUCT_KEYS = [
  'top_up_10',
  'top_up_20',
  'top_up_50',
  'top_up_100',
] as const;

export type MobileIapSubscriptionProductKey = (typeof MOBILE_IAP_SUBSCRIPTION_PRODUCT_KEYS)[number];
export type MobileIapTopUpProductKey = (typeof MOBILE_IAP_TOP_UP_PRODUCT_KEYS)[number];
export type MobileIapProductKey = MobileIapSubscriptionProductKey | MobileIapTopUpProductKey;

export interface MobileIapSubscriptionDefinition {
  key: MobileIapSubscriptionProductKey;
  kind: 'subscription';
  planTier: SelfServeIndividualPlanTier;
  interval: BillingInterval;
  intendedPriceUsd: number;
}

export interface MobileIapTopUpDefinition {
  key: MobileIapTopUpProductKey;
  kind: 'top_up';
  amountUsd: (typeof TOP_UP_PRESET_AMOUNTS_USD)[number];
  units: number;
}

export type MobileIapProductDefinition = MobileIapSubscriptionDefinition | MobileIapTopUpDefinition;

function requirePlanPriceUsd(tier: SelfServeIndividualPlanTier, interval: BillingInterval): number {
  const pricing = BILLING_PLAN_PRICING[tier];
  const amount = interval === 'monthly' ? pricing.monthlyPriceUsd : pricing.yearlyPriceUsd;
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error(`Mobile IAP definition references an unavailable ${tier} ${interval} price.`);
  }
  return amount;
}

function requireTopUpUnits(amountUsd: (typeof TOP_UP_PRESET_AMOUNTS_USD)[number]): number {
  const units = topUpUnitsForUsd(amountUsd);
  if (units === null) {
    throw new Error(`Mobile IAP definition references an invalid $${amountUsd} top-up.`);
  }
  return units;
}

/**
 * Store-neutral business products. App Store Connect / Play Console IDs are
 * deployment configuration and are deliberately absent here: guessing an ID
 * makes a purchase surface look live before either store has registered it.
 */
export const MOBILE_IAP_PRODUCT_DEFINITIONS = [
  {
    key: 'subscription_basic_monthly',
    kind: 'subscription',
    planTier: 'basic',
    interval: 'monthly',
    intendedPriceUsd: requirePlanPriceUsd('basic', 'monthly'),
  },
  {
    key: 'subscription_pro_monthly',
    kind: 'subscription',
    planTier: 'pro',
    interval: 'monthly',
    intendedPriceUsd: requirePlanPriceUsd('pro', 'monthly'),
  },
  {
    key: 'subscription_pro_yearly',
    kind: 'subscription',
    planTier: 'pro',
    interval: 'yearly',
    intendedPriceUsd: requirePlanPriceUsd('pro', 'yearly'),
  },
  {
    key: 'subscription_max_monthly',
    kind: 'subscription',
    planTier: 'max',
    interval: 'monthly',
    intendedPriceUsd: requirePlanPriceUsd('max', 'monthly'),
  },
  {
    key: 'subscription_max_15x_monthly',
    kind: 'subscription',
    planTier: 'max_15x',
    interval: 'monthly',
    intendedPriceUsd: requirePlanPriceUsd('max_15x', 'monthly'),
  },
  {
    key: 'top_up_10',
    kind: 'top_up',
    amountUsd: 10,
    units: requireTopUpUnits(10),
  },
  {
    key: 'top_up_20',
    kind: 'top_up',
    amountUsd: 20,
    units: requireTopUpUnits(20),
  },
  {
    key: 'top_up_50',
    kind: 'top_up',
    amountUsd: 50,
    units: requireTopUpUnits(50),
  },
  {
    key: 'top_up_100',
    kind: 'top_up',
    amountUsd: 100,
    units: requireTopUpUnits(100),
  },
] as const satisfies readonly MobileIapProductDefinition[];

export function getMobileIapProductDefinition(key: string): MobileIapProductDefinition | null {
  return MOBILE_IAP_PRODUCT_DEFINITIONS.find((definition) => definition.key === key) ?? null;
}

export function isMobileIapProductKey(value: string): value is MobileIapProductKey {
  return getMobileIapProductDefinition(value) !== null;
}

export type MobileIapCatalogProduct = MobileIapProductDefinition & { productId: string };

export interface MobileIapCatalogResponse {
  enabled: boolean;
  platform: MobileIapPlatform | null;
  appAccountToken: string | null;
  products: MobileIapCatalogProduct[];
  unavailableReason: string | null;
}

export interface MobileIapVerifyRequest {
  platform: MobileIapPlatform;
  productId: string;
  purchaseToken: string;
}

export interface MobileIapVerifyResponse {
  success: true;
  kind: MobileIapProductKind;
  productKey: MobileIapProductKey;
  status: 'active' | 'granted' | 'already_processed';
  planTier?: SelfServeIndividualPlanTier;
  currentPeriodEnd?: string | null;
  unitsGranted?: number;
}
