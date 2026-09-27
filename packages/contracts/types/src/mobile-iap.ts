import { getPlanPriceUsd, type SelfServeIndividualPlanTier } from './billing-catalog';
import { topUpUnitsForUsd } from './billing-topups';

export type MobileIapPlatform = 'ios' | 'android';
export type MobileIapProductKind = 'subscription' | 'top_up';

export const MOBILE_IAP_SUBSCRIPTION_PRODUCT_KEYS = [
  'subscription_basic_monthly',
  'subscription_pro_monthly',
  'subscription_max_monthly',
  'subscription_max_15x_monthly',
] as const;

export const MOBILE_IAP_TOP_UP_AMOUNTS_USD = [10, 20, 50, 100] as const;

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
  interval: 'monthly';
  intendedPriceUsd: number;
}

export interface MobileIapTopUpDefinition {
  key: MobileIapTopUpProductKey;
  kind: 'top_up';
  amountUsd: (typeof MOBILE_IAP_TOP_UP_AMOUNTS_USD)[number];
  units: number;
}

export type MobileIapProductDefinition = MobileIapSubscriptionDefinition | MobileIapTopUpDefinition;

function requireMonthlyPlanPriceUsd(tier: SelfServeIndividualPlanTier): number {
  const amount = getPlanPriceUsd(tier, 'monthly');
  if (amount === null || amount <= 0) {
    throw new Error(`Mobile IAP definition references an unavailable ${tier} monthly price.`);
  }
  return amount;
}

function requireTopUpUnits(amountUsd: (typeof MOBILE_IAP_TOP_UP_AMOUNTS_USD)[number]): number {
  const units = topUpUnitsForUsd(amountUsd);
  if (units === null) {
    throw new Error(`Mobile IAP definition references an invalid $${amountUsd} top-up.`);
  }
  return units;
}

export const MOBILE_IAP_PRODUCT_DEFINITIONS = [
  {
    key: 'subscription_basic_monthly',
    kind: 'subscription',
    planTier: 'basic',
    interval: 'monthly',
    intendedPriceUsd: requireMonthlyPlanPriceUsd('basic'),
  },
  {
    key: 'subscription_pro_monthly',
    kind: 'subscription',
    planTier: 'pro',
    interval: 'monthly',
    intendedPriceUsd: requireMonthlyPlanPriceUsd('pro'),
  },
  {
    key: 'subscription_max_monthly',
    kind: 'subscription',
    planTier: 'max',
    interval: 'monthly',
    intendedPriceUsd: requireMonthlyPlanPriceUsd('max'),
  },
  {
    key: 'subscription_max_15x_monthly',
    kind: 'subscription',
    planTier: 'max_15x',
    interval: 'monthly',
    intendedPriceUsd: requireMonthlyPlanPriceUsd('max_15x'),
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

export type MobileIapUnavailableCode = 'waitlist_access_required';

export interface MobileIapCatalogResponse {
  enabled: boolean;
  platform: MobileIapPlatform | null;
  appAccountToken: string | null;
  products: MobileIapCatalogProduct[];
  unavailableReason: string | null;
  unavailableCode: MobileIapUnavailableCode | null;
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

export const BASIS_POINTS_PER_WHOLE = 10_000;

export interface MobileIapStoreCommission {
  subscriptionFirstYearBasisPoints: number;
  subscriptionAfterFirstYearBasisPoints: number;
  oneTimeBasisPoints: number;
  source: string;
  verifiedOn: string;
}

export const MOBILE_IAP_STORE_COMMISSION: Readonly<
  Record<MobileIapPlatform, MobileIapStoreCommission>
> = Object.freeze({
  ios: {
    subscriptionFirstYearBasisPoints: 3_000,
    subscriptionAfterFirstYearBasisPoints: 1_500,
    oneTimeBasisPoints: 3_000,
    source: 'https://developer.apple.com/app-store/subscriptions/',
    verifiedOn: '2026-09-27',
  },
  android: {
    subscriptionFirstYearBasisPoints: 1_500,
    subscriptionAfterFirstYearBasisPoints: 1_500,
    oneTimeBasisPoints: 1_500,
    source: 'https://support.google.com/googleplay/android-developer/answer/112622',
    verifiedOn: '2026-09-27',
  },
});

export function mobileIapStoreCommissionBasisPoints(input: {
  platform: MobileIapPlatform;
  kind: MobileIapProductKind;
  afterFirstYear: boolean;
}): number {
  const commission = MOBILE_IAP_STORE_COMMISSION[input.platform];
  if (input.kind === 'top_up') return commission.oneTimeBasisPoints;
  return input.afterFirstYear
    ? commission.subscriptionAfterFirstYearBasisPoints
    : commission.subscriptionFirstYearBasisPoints;
}
