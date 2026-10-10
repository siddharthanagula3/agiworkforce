import { getPlanPriceUsd, type SelfServeIndividualPlanTier } from './billing-catalog';
import { topUpUnitsForUsd } from './billing-topups';
import { EEA_COUNTRY_CODES } from './country-groups';

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

export interface MobileIapOneTimeMarketRate {
  countries: ReadonlySet<string>;
  basisPoints: number;
  basis: string;
}

export interface MobileIapStoreCommission {
  subscriptionFirstYearBasisPoints: number;
  subscriptionAfterFirstYearBasisPoints: number;
  oneTimeBasisPoints: number;
  oneTimeMarkets: readonly MobileIapOneTimeMarketRate[];
  source: string;
  verifiedOn: string;
}

const GOOGLE_PLAY_FEE_ROLLOUT_COUNTRIES: ReadonlySet<string> = new Set([
  ...EEA_COUNTRY_CODES,
  'GB',
  'US',
]);

/**
 * What each store keeps of a sale. Neither Apple's Small Business Program nor
 * Google Play's 15% service-fee tier is recorded as enrolled, so the standard
 * rates apply; `oneTimeBasisPoints` is the rate wherever no market row matches,
 * including a purchase whose country is unknown.
 *
 * Google Play, read 2026-10-10: from 2026-06-30 in the EEA, UK and US an
 * auto-renewing subscription is a 10% service fee plus a 5% billing fee, and any
 * other in-app purchase on an install made since then is 20% plus 5%. This app
 * was not on Google Play before that date, so every install is a new install.
 * Elsewhere a subscription is 15% and any other purchase is 30% outside the 15%
 * tier.
 */
export const MOBILE_IAP_STORE_COMMISSION: Readonly<
  Record<MobileIapPlatform, MobileIapStoreCommission>
> = Object.freeze({
  ios: {
    subscriptionFirstYearBasisPoints: 3_000,
    subscriptionAfterFirstYearBasisPoints: 1_500,
    oneTimeBasisPoints: 3_000,
    oneTimeMarkets: [],
    source: 'https://developer.apple.com/app-store/subscriptions/',
    verifiedOn: '2026-09-27',
  },
  android: {
    subscriptionFirstYearBasisPoints: 1_500,
    subscriptionAfterFirstYearBasisPoints: 1_500,
    oneTimeBasisPoints: 3_000,
    oneTimeMarkets: [
      {
        countries: GOOGLE_PLAY_FEE_ROLLOUT_COUNTRIES,
        basisPoints: 2_500,
        basis: '20% service fee plus 5% billing fee on installs made since the 2026-06-30 rollout',
      },
    ],
    source: 'https://support.google.com/googleplay/android-developer/answer/112622',
    verifiedOn: '2026-10-10',
  },
});

export function mobileIapStoreCommissionBasisPoints(input: {
  platform: MobileIapPlatform;
  kind: MobileIapProductKind;
  afterFirstYear: boolean;
  purchaseCountry?: string | null;
}): number {
  const commission = MOBILE_IAP_STORE_COMMISSION[input.platform];
  if (input.kind === 'top_up') {
    const country = input.purchaseCountry?.trim().toUpperCase();
    const market = country
      ? commission.oneTimeMarkets.find((entry) => entry.countries.has(country))
      : undefined;
    return market?.basisPoints ?? commission.oneTimeBasisPoints;
  }
  return input.afterFirstYear
    ? commission.subscriptionAfterFirstYearBasisPoints
    : commission.subscriptionFirstYearBasisPoints;
}
