import 'server-only';

import type { BillingInterval } from '@agiworkforce/types';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { getConfiguredPriceId, type ConfiguredCheckoutPlan } from '@/lib/pricing';
import {
  getCurrencyForCountry,
  resolveLocalizedPlanPrice,
  type LocalizedPlanPrice,
  type StripePriceLike,
} from '@/lib/regional-pricing';

export interface LocalizedPriceEntry extends LocalizedPlanPrice {
  checkoutReady: boolean;
}

export interface LocalizedPlanPrices {
  monthly?: LocalizedPriceEntry;
  yearly?: LocalizedPriceEntry;
}

export interface LocalizedPricingCatalog {
  country: string;
  requestedCurrency: string;
  plans: Record<ConfiguredCheckoutPlan, LocalizedPlanPrices>;
}

export interface CheckoutPriceSelection {
  priceId: string;
  currency: string;
  amountMinor: number;
}

const PLAN_INTERVALS: Readonly<Record<ConfiguredCheckoutPlan, readonly BillingInterval[]>> = {
  basic: ['monthly'],
  pro: ['monthly', 'yearly'],
  max: ['monthly'],
  max_15x: ['monthly'],
  team: ['monthly', 'yearly'],
};

const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;
const priceCache = new Map<string, { expiresAt: number; price: StripePriceLike }>();

async function retrieveStripePrice(priceId: string): Promise<StripePriceLike | null> {
  const cached = priceCache.get(priceId);
  if (cached && cached.expiresAt > Date.now()) return cached.price;

  const stripe = getStripeClientOrNull();
  if (!stripe) return null;

  let price;
  try {
    price = await stripe.prices.retrieve(priceId, { expand: ['currency_options'] });
  } catch (error) {
    console.warn(
      `[localized-pricing] Stripe price lookup failed for ${priceId}; serving catalog USD fallback (checkout stays closed for this price):`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
  const normalized: StripePriceLike = {
    currency: price.currency,
    unit_amount: price.unit_amount,
    currency_options: price.currency_options,
  };
  priceCache.set(priceId, { expiresAt: Date.now() + PRICE_CACHE_TTL_MS, price: normalized });
  return normalized;
}

function stripeAmountForCurrency(price: StripePriceLike | null, currency: string): number | null {
  const normalized = currency.toLowerCase();
  if (price?.currency.toLowerCase() === normalized && typeof price.unit_amount === 'number') {
    return price.unit_amount;
  }
  const optionAmount = price?.currency_options?.[normalized]?.unit_amount;
  return typeof optionAmount === 'number' ? optionAmount : null;
}

export async function getLocalizedPricingCatalog(
  countryCode: string,
): Promise<LocalizedPricingCatalog> {
  const country = countryCode.trim().toUpperCase() || 'US';
  const requestedCurrency = getCurrencyForCountry(country);
  const plans = {} as Record<ConfiguredCheckoutPlan, LocalizedPlanPrices>;

  await Promise.all(
    (Object.keys(PLAN_INTERVALS) as ConfiguredCheckoutPlan[]).map(async (plan) => {
      const entries: LocalizedPlanPrices = {};
      await Promise.all(
        PLAN_INTERVALS[plan].map(async (interval) => {
          const priceId = getConfiguredPriceId(plan, interval, requestedCurrency);
          const stripePrice = priceId ? await retrieveStripePrice(priceId) : null;
          const localized = resolveLocalizedPlanPrice(
            plan,
            interval,
            requestedCurrency,
            stripePrice,
          );
          const configuredAmount = stripeAmountForCurrency(stripePrice, localized.currency);
          entries[interval] = {
            ...localized,
            checkoutReady:
              Boolean(priceId) &&
              configuredAmount !== null &&
              configuredAmount === localized.amountMinor,
          };
        }),
      );
      plans[plan] = entries;
    }),
  );

  return { country, requestedCurrency, plans };
}

export async function getCheckoutPriceSelection(
  plan: ConfiguredCheckoutPlan,
  interval: BillingInterval,
  countryCode: string,
): Promise<CheckoutPriceSelection | null> {
  return getPriceSelectionForCurrency(plan, interval, getCurrencyForCountry(countryCode));
}

export async function getPriceSelectionForCurrency(
  plan: ConfiguredCheckoutPlan,
  interval: BillingInterval,
  requestedCurrency: string,
): Promise<CheckoutPriceSelection | null> {
  const normalizedCurrency = requestedCurrency.trim().toLowerCase();
  const priceId = getConfiguredPriceId(plan, interval, normalizedCurrency);
  if (!priceId) return null;

  const stripePrice = await retrieveStripePrice(priceId);
  if (!stripePrice) return null;

  const localized = resolveLocalizedPlanPrice(plan, interval, normalizedCurrency, stripePrice);
  const configuredAmount = stripeAmountForCurrency(stripePrice, localized.currency);
  if (configuredAmount === null || configuredAmount !== localized.amountMinor) {
    console.warn(
      `[localized-pricing] Stripe price ${priceId} charges ${configuredAmount ?? 'nothing'} ` +
        `${localized.currency} for ${plan} ${interval} but the published price is ` +
        `${localized.amountMinor}; checkout stays closed until the Stripe catalog matches.`,
    );
    return null;
  }

  return { priceId, currency: localized.currency, amountMinor: localized.amountMinor };
}
