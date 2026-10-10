import 'server-only';

import {
  SELF_SERVE_PAID_PLAN_TIERS,
  TEAM_SEAT_UPGRADE_TIERS,
  billingIntervalsForPlan,
  type BillingInterval,
} from '@agiworkforce/types';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { getConfiguredPriceId, type ConfiguredPricePlan } from '@/lib/pricing';
import {
  getCurrencyForCountry,
  resolveLocalizedPlanPrice,
  type LocalizedPlanPrice,
  type StripePriceLike,
} from '@/lib/regional-pricing';
import { priceTaxBehaviorForCurrency } from '@/lib/billing/tax-policy';

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
  plans: Record<ConfiguredPricePlan, LocalizedPlanPrices>;
}

export interface CheckoutPriceSelection {
  priceId: string;
  currency: string;
  amountMinor: number;
}

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
    tax_behavior: price.tax_behavior,
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

/**
 * A Stripe Price's tax behaviour is fixed once set, so a Price created as
 * exclusive would add GST on top of an INR price the page shows as including
 * it. Checkout opens only for a Price whose behaviour matches the catalogue.
 */
export function stripePriceMatchesTaxBehavior(
  price: StripePriceLike | null,
  currency: string,
): boolean {
  const normalized = currency.toLowerCase();
  const behavior =
    price?.currency.toLowerCase() === normalized
      ? price.tax_behavior
      : price?.currency_options?.[normalized]?.tax_behavior;
  const expected = priceTaxBehaviorForCurrency(normalized);
  return expected === 'inclusive' ? behavior === 'inclusive' : behavior !== 'inclusive';
}

export async function getLocalizedPricingCatalog(
  countryCode: string,
): Promise<LocalizedPricingCatalog> {
  const country = countryCode.trim().toUpperCase() || 'US';
  const requestedCurrency = getCurrencyForCountry(country);
  const plans = {} as Record<ConfiguredPricePlan, LocalizedPlanPrices>;
  const pricedPlans: readonly ConfiguredPricePlan[] = [
    ...SELF_SERVE_PAID_PLAN_TIERS,
    ...TEAM_SEAT_UPGRADE_TIERS,
  ];

  await Promise.all(
    pricedPlans.map(async (plan) => {
      const entries: LocalizedPlanPrices = {};
      await Promise.all(
        billingIntervalsForPlan(plan).map(async (interval) => {
          const priceId = getConfiguredPriceId(plan, interval, requestedCurrency);
          const stripePrice = priceId ? await retrieveStripePrice(priceId) : null;
          const localized = resolveLocalizedPlanPrice(
            plan,
            interval,
            requestedCurrency,
            stripePrice,
          );
          if (!localized) return;
          const configuredAmount = stripeAmountForCurrency(stripePrice, localized.currency);
          entries[interval] = {
            ...localized,
            checkoutReady:
              Boolean(priceId) &&
              configuredAmount !== null &&
              configuredAmount === localized.amountMinor &&
              stripePriceMatchesTaxBehavior(stripePrice, localized.currency),
          };
        }),
      );
      plans[plan] = entries;
    }),
  );

  return { country, requestedCurrency, plans };
}

export async function getCheckoutPriceSelection(
  plan: ConfiguredPricePlan,
  interval: BillingInterval,
  countryCode: string,
): Promise<CheckoutPriceSelection | null> {
  return getPriceSelectionForCurrency(plan, interval, getCurrencyForCountry(countryCode));
}

export async function getPriceSelectionForCurrency(
  plan: ConfiguredPricePlan,
  interval: BillingInterval,
  requestedCurrency: string,
): Promise<CheckoutPriceSelection | null> {
  const normalizedCurrency = requestedCurrency.trim().toLowerCase();
  const priceId = getConfiguredPriceId(plan, interval, normalizedCurrency);
  if (!priceId) return null;

  const stripePrice = await retrieveStripePrice(priceId);
  if (!stripePrice) return null;

  const localized = resolveLocalizedPlanPrice(plan, interval, normalizedCurrency, stripePrice);
  if (!localized) return null;
  const configuredAmount = stripeAmountForCurrency(stripePrice, localized.currency);
  if (configuredAmount === null || configuredAmount !== localized.amountMinor) {
    console.warn(
      `[localized-pricing] Stripe price ${priceId} charges ${configuredAmount ?? 'nothing'} ` +
        `${localized.currency} for ${plan} ${interval} but the published price is ` +
        `${localized.amountMinor}; checkout stays closed until the Stripe catalog matches.`,
    );
    return null;
  }
  if (!stripePriceMatchesTaxBehavior(stripePrice, localized.currency)) {
    console.warn(
      `[localized-pricing] Stripe price ${priceId} is not ${priceTaxBehaviorForCurrency(localized.currency)} ` +
        `of tax for ${localized.currency}; checkout stays closed until a matching Price is configured.`,
    );
    return null;
  }

  return { priceId, currency: localized.currency, amountMinor: localized.amountMinor };
}
