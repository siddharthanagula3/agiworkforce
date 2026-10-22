import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  getPlanPriceUsd,
  type SelfServeIndividualPlanTier,
} from './billing-catalog';
import {
  normalizePurchaseCountry,
  purchaseCountryFromAppStoreStorefront,
  purchasedCreditExpiryRule,
  topUpUnitsForUsd,
} from './billing-topups';
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

export interface MobileIapStoreOffer {
  basePlanId: string;
  offerId: string | null;
}

export type MobileIapCatalogProduct = MobileIapProductDefinition & {
  productId: string;
  googleOffer?: MobileIapStoreOffer | null;
};

export type MobileIapPlanChangeDirection = 'upgrade' | 'downgrade';

export const MOBILE_IAP_ANDROID_REPLACEMENT_MODES = [
  'with-time-proration',
  'charge-prorated-price',
  'charge-full-price',
  'without-proration',
  'deferred',
] as const;

export type MobileIapAndroidReplacementMode = (typeof MOBILE_IAP_ANDROID_REPLACEMENT_MODES)[number];

export type MobileIapAndroidReplacementModes = Record<
  MobileIapPlanChangeDirection,
  MobileIapAndroidReplacementMode
>;

/**
 * Google Play's own recommendation, read 2026-10-12 at
 * https://developer.android.com/google/play/billing/subscriptions: an upgrade
 * charges the prorated difference and starts at once, a downgrade waits for the
 * renewal the buyer already paid for. `charge-prorated-price` is refused by Play
 * for anything but an upgrade.
 */
export const MOBILE_IAP_DEFAULT_ANDROID_REPLACEMENT_MODES: MobileIapAndroidReplacementModes =
  Object.freeze({ upgrade: 'charge-prorated-price', downgrade: 'deferred' });

export function mobileIapPlanChangeDirection(
  fromTier: SelfServeIndividualPlanTier,
  toTier: SelfServeIndividualPlanTier,
): MobileIapPlanChangeDirection | null {
  const from = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.indexOf(fromTier);
  const to = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.indexOf(toTier);
  if (from < 0 || to < 0 || from === to) return null;
  return to > from ? 'upgrade' : 'downgrade';
}

export interface MobileIapCatalogResponse {
  enabled: boolean;
  platform: MobileIapPlatform | null;
  appAccountToken: string | null;
  products: MobileIapCatalogProduct[];
  unavailableReason: string | null;
  androidReplacementModes?: MobileIapAndroidReplacementModes;
  /** Why plans are withheld from an account another billing channel still charges. */
  subscriptionsUnavailableReason?: string | null;
  /** Every store product the device must consume once granted, offered or not. */
  consumableProductIds?: string[];
}

const STOREFRONT_CODE = /^[A-Z]{2,3}$/;

/**
 * App Store Review Guideline 3.1.1 and Google Play's payments policy forbid
 * purchased credits that expire. Where `PURCHASED_CREDIT_EXPIRY_RULES` expires
 * them, the stores do not sell top-ups at all; plans still sell there.
 */
export function mobileIapCountrySellsTopUps(country: string | null | undefined): boolean {
  return purchasedCreditExpiryRule(country) === null;
}

/**
 * The store country the app reports: an App Store storefront is ISO 3166-1
 * alpha-3, a Google Play billing country alpha-2. An unreadable code sells no
 * top-ups, so a buyer is never charged for credits the server would refuse.
 */
export function mobileIapStorefrontSellsTopUps(storefront: unknown): boolean {
  if (typeof storefront !== 'string') return false;
  const code = storefront.trim().toUpperCase();
  if (!STOREFRONT_CODE.test(code)) return false;
  return mobileIapCountrySellsTopUps(
    purchaseCountryFromAppStoreStorefront(code) ?? normalizePurchaseCountry(code),
  );
}

export interface MobileIapVerifyResponse {
  success: true;
  kind: MobileIapProductKind;
  productKey: MobileIapProductKey;
  status: 'active' | 'granted' | 'already_processed';
  planTier?: SelfServeIndividualPlanTier;
  currentPeriodEnd?: string | null;
  unitsGranted?: number;
  scheduledPlanTier?: SelfServeIndividualPlanTier;
  storeAcknowledged?: boolean;
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
