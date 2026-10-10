import countryToCurrency, { type Countries } from 'country-to-currency';
import {
  currencyMinorUnitDigits,
  getPlanPriceInCurrency,
  getPublishedPlanPriceCents,
  isBillingCurrency,
  type BillingInterval,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { priceTaxBehaviorForCurrency } from '@/lib/billing/tax-policy';

export type PublicCheckoutPlan = Extract<
  BillingPlanTier,
  'basic' | 'pro' | 'max' | 'max_15x' | 'team' | 'team_premium'
>;

export interface StripePriceLike {
  currency: string;
  unit_amount: number | null;
  tax_behavior?: string | null;
  currency_options?: Record<
    string,
    { unit_amount?: number | null; tax_behavior?: string | null }
  > | null;
}

export interface LocalizedPlanPrice {
  amountMinor: number;
  currency: string;
  localized: boolean;
  taxIncluded: boolean;
}

function localizedPrice(amountMinor: number, currency: string): LocalizedPlanPrice {
  return {
    amountMinor,
    currency,
    localized: true,
    taxIncluded: priceTaxBehaviorForCurrency(currency) === 'inclusive',
  };
}

function cataloguePriceMinor(
  plan: PublicCheckoutPlan,
  interval: BillingInterval,
  currency: string,
): number | null {
  if (!isBillingCurrency(currency) || currency === 'usd') return null;
  const amount = getPlanPriceInCurrency(plan, interval, currency);
  return amount === null ? null : Math.round(amount * 10 ** currencyMinorUnitDigits(currency));
}

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
): LocalizedPlanPrice | null {
  const publishedMinor = getPublishedPlanPriceCents(plan, interval);
  if (publishedMinor === null) return null;
  const currency = requestedCurrency.trim().toLowerCase();
  const publishedUsd: LocalizedPlanPrice = {
    amountMinor: publishedMinor,
    currency: 'usd',
    localized: false,
    taxIncluded: priceTaxBehaviorForCurrency('usd') === 'inclusive',
  };

  if (currency === 'usd') return publishedUsd;

  const catalogueMinor = cataloguePriceMinor(plan, interval, currency);
  if (catalogueMinor !== null) return localizedPrice(catalogueMinor, currency);

  const currencyOption = stripePrice?.currency_options?.[currency];
  if (typeof currencyOption?.unit_amount === 'number') {
    return localizedPrice(currencyOption.unit_amount, currency);
  }

  if (
    stripePrice?.currency.toLowerCase() === currency &&
    typeof stripePrice.unit_amount === 'number'
  ) {
    return localizedPrice(stripePrice.unit_amount, currency);
  }

  return publishedUsd;
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
  }).format(amountMinor / 10 ** currencyMinorUnitDigits(normalizedCurrency));
}
