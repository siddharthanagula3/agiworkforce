import countryToCurrency, { type Countries } from 'country-to-currency';
import {
  getPublishedPlanPriceCents,
  type BillingInterval,
  type BillingPlanTier,
} from '@agiworkforce/types';

export type PublicCheckoutPlan = Extract<
  BillingPlanTier,
  'basic' | 'pro' | 'max' | 'max_15x' | 'team'
>;

export interface StripePriceLike {
  currency: string;
  unit_amount: number | null;
  currency_options?: Record<string, { unit_amount?: number | null }> | null;
}

export interface LocalizedPlanPrice {
  amountMinor: number;
  currency: string;
  localized: boolean;
}

/**
 * Founder-set regional prices. These are public subscription prices, not
 * internal usage budgets. Other currencies come from Stripe multi-currency
 * Price options so the marketing page and Checkout use the same amount.
 */
const INDIA_MONTHLY_PRICE_MINOR: Readonly<Partial<Record<PublicCheckoutPlan, number>>> =
  Object.freeze({
    basic: 39_900,
    pro: 199_900,
    max: 999_900,
    max_15x: 2_499_900,
    // Per SEAT per month, mirroring Pro because a Team seat carries Pro's exact
    // managed-usage allowance. Multiply by the purchased seat count for the bill.
    team: 199_900,
  });

export function getCurrencyForCountry(countryCode: string | null | undefined): string {
  const normalized = countryCode?.trim().toUpperCase();
  if (!normalized || normalized.length !== 2 || !(normalized in countryToCurrency)) {
    return 'usd';
  }
  return countryToCurrency[normalized as Countries].toLowerCase();
}

export function resolveLocalizedPlanPrice(
  plan: PublicCheckoutPlan,
  interval: BillingInterval,
  requestedCurrency: string,
  stripePrice: StripePriceLike | null,
): LocalizedPlanPrice {
  const currency = requestedCurrency.trim().toLowerCase();
  const founderSetIndiaPrice =
    interval === 'monthly' && currency === 'inr' ? INDIA_MONTHLY_PRICE_MINOR[plan] : undefined;

  if (typeof founderSetIndiaPrice === 'number') {
    return { amountMinor: founderSetIndiaPrice, currency: 'inr', localized: true };
  }

  const currencyOption = stripePrice?.currency_options?.[currency];
  if (typeof currencyOption?.unit_amount === 'number') {
    return { amountMinor: currencyOption.unit_amount, currency, localized: true };
  }

  if (
    stripePrice?.currency.toLowerCase() === currency &&
    typeof stripePrice.unit_amount === 'number'
  ) {
    return { amountMinor: stripePrice.unit_amount, currency, localized: currency !== 'usd' };
  }

  return {
    // `PublicCheckoutPlan` excludes contract-priced tiers, so this accessor
    // returns a real published amount with no `?? 0` fallback to fake one.
    amountMinor: getPublishedPlanPriceCents(plan, interval),
    currency: 'usd',
    localized: false,
  };
}

export function formatLocalizedPrice(
  amountMinor: number,
  currency: string,
  locale?: string,
): string {
  const normalizedCurrency = currency.trim().toUpperCase();
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: normalizedCurrency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}
