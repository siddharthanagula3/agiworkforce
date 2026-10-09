import {
  LOCALIZED_PRICING_PATH,
  localizedPriceEntrySchema,
  localizedPricingCatalogSchema,
  type LocalizedPlanPrices,
  type LocalizedPriceEntry,
  type LocalizedPricedPlan,
  type LocalizedPricingCatalog,
} from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_PRICING,
  currencyMinorUnitDigits,
  getPlanPriceUsd,
  type BillingInterval,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';

// The env var is an incident-response kill-switch: set
// NEXT_PUBLIC_CHECKOUT_ENABLED=0 (or 'false'/'off') to re-gate.
//
// NEXT_PUBLIC_CHECKOUT_ENABLED MUST be kept equal to the server-side
// STRIPE_CHECKOUT_ENABLED flag (app/api/checkout/route.ts) and to the same
// server-side checkout flag, see apps/web/.env.example. If they diverge, the
// CTA and the API will disagree about whether checkout is actually available.
const CHECKOUT_ENABLED_RAW = process.env['NEXT_PUBLIC_CHECKOUT_ENABLED']?.trim().toLowerCase();
export const CHECKOUT_ENABLED =
  CHECKOUT_ENABLED_RAW !== '0' &&
  CHECKOUT_ENABLED_RAW !== 'false' &&
  CHECKOUT_ENABLED_RAW !== 'off';

export const CHECKOUT_DISABLED_NOTICE =
  'Checkout is temporarily unavailable. Please try again later. Existing plans and Enterprise contact are unaffected.';
export const CHECKOUT_AVAILABILITY_LOADING_NOTICE = 'Loading checkout availability…';
export const CHECKOUT_AVAILABILITY_ERROR_NOTICE =
  'Checkout availability could not be verified. Refresh this page to try again.';

export function checkoutUnavailableInRegionNotice(plan: SelfServePaidPlanTier): string {
  return `${BILLING_PLAN_PRICING[plan].label} checkout is not available in your region yet.`;
}

export type LocalizedPricingStatus = 'loading' | 'ready' | 'error';

export function formatPlanAmount(
  amount: number,
  currency: string,
  locale: string | undefined,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatLocalizedAmount(
  entry: LocalizedPriceEntry | undefined,
  fallbackUsd: number,
  locale: string | undefined,
  divisor = 1,
  multiplier = 1,
): string {
  if (!entry) return formatPlanAmount((fallbackUsd * multiplier) / divisor, 'USD', locale);
  const minorPerUnit = 10 ** currencyMinorUnitDigits(entry.currency);
  return formatPlanAmount(
    (entry.amountMinor * multiplier) / minorPerUnit / divisor,
    entry.currency,
    locale,
  );
}

export function localizedPriceEntry(
  plans: LocalizedPlanPrices | undefined,
  plan: LocalizedPricedPlan,
  interval: BillingInterval,
): LocalizedPriceEntry | undefined {
  return plans?.[plan]?.[interval];
}

export function localizedPricePerMonth(
  plans: LocalizedPlanPrices | undefined,
  plan: LocalizedPricedPlan,
  interval: BillingInterval,
  locale: string | undefined,
): string {
  return formatLocalizedAmount(
    localizedPriceEntry(plans, plan, interval),
    getPlanPriceUsd(plan, interval) ?? 0,
    locale,
    interval === 'yearly' ? 12 : 1,
  );
}

export function localizedFreePrice(
  plans: LocalizedPlanPrices | undefined,
  locale: string | undefined,
): string {
  const paidEntry = plans?.basic.monthly ?? plans?.pro.monthly;
  return formatLocalizedAmount(paidEntry ? { ...paidEntry, amountMinor: 0 } : undefined, 0, locale);
}

// Yearly Team is offered ONLY when the yearly Price is configured and its
// amount matches the catalog (checkoutReady). Absent env → not offered, and
// the cadence stays monthly (fail-closed at the display layer; the checkout
// route refuses a yearly Team price it cannot resolve regardless).
export function teamYearlyCheckoutReady(plans: LocalizedPlanPrices | undefined): boolean {
  return plans?.team.yearly?.checkoutReady === true;
}

export function teamBillingInterval(
  plans: LocalizedPlanPrices | undefined,
  annual: boolean,
): BillingInterval {
  return annual && teamYearlyCheckoutReady(plans) ? 'yearly' : 'monthly';
}

export function planCheckoutReady(
  plans: LocalizedPlanPrices | undefined,
  plan: SelfServePaidPlanTier,
  interval: BillingInterval,
): boolean {
  return localizedPriceEntry(plans, plan, interval)?.checkoutReady === true;
}

export {
  LOCALIZED_PRICING_PATH,
  localizedPriceEntrySchema,
  localizedPricingCatalogSchema,
  type LocalizedPlanPrices,
  type LocalizedPriceEntry,
  type LocalizedPricedPlan,
  type LocalizedPricingCatalog,
};
