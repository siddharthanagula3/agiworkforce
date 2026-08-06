import 'server-only';

import Stripe from 'stripe';
import { getOptionalEnv, requireEnv } from '@shared/utils/env';
import type { BillingInterval } from '@agiworkforce/types';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
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
  // Team is sold monthly and yearly ($25/seat/mo, $240/seat/yr — Decision #22).
  // Every amount published for Team is PER SEAT — the seat count is the Stripe
  // line-item quantity, never part of the unit price. Yearly is USD-only; an
  // unconfigured STRIPE_PRICE_TEAM_YEARLY_USD makes the yearly entry
  // checkoutReady=false so the pricing page does not offer it (fail-closed).
  team: ['monthly', 'yearly'],
};

const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;
const priceCache = new Map<string, { expiresAt: number; price: StripePriceLike }>();
let stripeClient: Stripe | null = null;

function getStripe(): Stripe | null {
  if (!getOptionalEnv('STRIPE_SECRET_KEY')) return null;
  stripeClient ??= new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: STRIPE_API_VERSION });
  return stripeClient;
}

async function retrieveStripePrice(priceId: string): Promise<StripePriceLike | null> {
  const cached = priceCache.get(priceId);
  if (cached && cached.expiresAt > Date.now()) return cached.price;

  const stripe = getStripe();
  if (!stripe) return null;

  // Fail SOFT on the read path: a Stripe lookup error (deleted price, live/test
  // key–price mode mismatch, transient API failure) must degrade the DISPLAY to
  // the catalog USD fallback with checkoutReady=false — not 500 the pricing
  // page's price hydration. Checkout stays fail-closed separately: a null here
  // makes getPriceSelectionForCurrency return null, which refuses checkout.
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

/**
 * Resolve a configured Price in an existing subscription's billing currency.
 * Subscription updates cannot safely infer a new currency from the user's
 * current IP location, which may differ from the currency they originally
 * purchased in.
 */
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
  if (configuredAmount === null || configuredAmount !== localized.amountMinor) return null;

  return { priceId, currency: localized.currency, amountMinor: localized.amountMinor };
}
