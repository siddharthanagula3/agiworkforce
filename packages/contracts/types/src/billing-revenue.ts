import {
  BILLING_CURRENCY_TERMS,
  getPlanPriceInCurrency,
  getPlanPriceUsd,
  type BillingCurrency,
  type BillingPlanTier,
} from './billing-catalog';
import { CREDITS_PER_CENT } from './credits';
import {
  managedUsageLimitsForCatalogVersion,
  planCreditAllowanceFromLimit,
  type ManagedUsageLimit,
  type PlanCreditAllowance,
} from './managed-usage-limits';
import {
  BASIS_POINTS_PER_WHOLE,
  mobileIapStoreCommissionBasisPoints,
  type MobileIapPlatform,
} from './mobile-iap';

export type RevenueChannel = 'web' | MobileIapPlatform;

/**
 * Where a subscription's money comes from: the channel that sold it and the
 * currency it is charged in. A subscriber with no known context is sized
 * exactly like a US web subscriber, which is the budget every base value in
 * `managed-usage-limits.ts` was set against.
 */
export interface RevenueContext {
  channel: RevenueChannel;
  currency: BillingCurrency;
  purchaseCountry?: string | null;
}

export const REFERENCE_REVENUE_CONTEXT: RevenueContext = Object.freeze({
  channel: 'web',
  currency: 'usd',
});

/**
 * What a Stripe charge costs this account, a US Stripe account settling in USD.
 * The tax-calculation fee applies only where the account is registered to
 * collect tax; it is counted on every web charge because Checkout enables
 * automatic tax on every session, which errs toward the smaller budget.
 */
export const CARD_PAYMENT_FEES = Object.freeze({
  accountSettlementCurrency: 'usd' satisfies BillingCurrency,
  cardBasisPoints: 290,
  fixedUsd: 0.3,
  internationalCardBasisPoints: 150,
  currencyConversionBasisPoints: 100,
  recurringBillingBasisPoints: 70,
  taxCalculationBasisPoints: 50,
  sources: Object.freeze({
    card: 'https://stripe.com/pricing',
    recurringBilling: 'https://stripe.com/billing/pricing',
    taxCalculation: 'https://stripe.com/tax/pricing',
  }),
  verifiedOn: '2026-10-10',
});

function webNetRevenueUsd(tier: BillingPlanTier, currency: BillingCurrency): number | null {
  const gross = getPlanPriceInCurrency(tier, 'monthly', currency);
  if (gross === null || gross <= 0) return null;
  const terms = BILLING_CURRENCY_TERMS[currency];
  const beforeIncludedTax = gross / (1 + (terms.includedTax?.rate ?? 0));
  const grossUsd = beforeIncludedTax * terms.usdPerUnit.rate;
  const feeBasisPoints =
    CARD_PAYMENT_FEES.cardBasisPoints +
    (terms.typicalCardOrigin === 'international'
      ? CARD_PAYMENT_FEES.internationalCardBasisPoints
      : 0) +
    (currency === CARD_PAYMENT_FEES.accountSettlementCurrency
      ? 0
      : CARD_PAYMENT_FEES.currencyConversionBasisPoints) +
    CARD_PAYMENT_FEES.recurringBillingBasisPoints +
    CARD_PAYMENT_FEES.taxCalculationBasisPoints;
  return grossUsd * (1 - feeBasisPoints / BASIS_POINTS_PER_WHOLE) - CARD_PAYMENT_FEES.fixedUsd;
}

function storeNetRevenueUsd(tier: BillingPlanTier, context: RevenueContext): number | null {
  if (context.channel === 'web') return null;
  const price = getPlanPriceUsd(tier, 'monthly');
  if (price === null || price <= 0) return null;
  const commission = mobileIapStoreCommissionBasisPoints({
    platform: context.channel,
    kind: 'subscription',
    afterFirstYear: false,
    purchaseCountry: context.purchaseCountry ?? null,
  });
  return price * (1 - commission / BASIS_POINTS_PER_WHOLE);
}

/**
 * One month of a plan's revenue in USD after the payment processor's or the
 * store's cut and after any tax the price already includes. Null where the plan
 * has no price in that currency or channel.
 */
export function monthlyNetRevenueUsd(
  tier: BillingPlanTier,
  context: RevenueContext,
): number | null {
  return context.channel === 'web'
    ? webNetRevenueUsd(tier, context.currency)
    : storeNetRevenueUsd(tier, context);
}

/**
 * The share of the plan's base budget this subscriber's revenue pays for,
 * against the US web price of the same plan. A yearly seat is sized from the
 * monthly price of its region and channel, as monthly seats are.
 */
export function revenueBudgetRatio(
  tier: BillingPlanTier,
  context: RevenueContext | null | undefined,
): number {
  if (!context) return 1;
  const reference = monthlyNetRevenueUsd(tier, REFERENCE_REVENUE_CONTEXT);
  const subject = monthlyNetRevenueUsd(tier, context);
  if (reference === null || subject === null || reference <= 0) return 1;
  return Math.max(0, subject / reference);
}

function scaleCredits(credits: number, ratio: number): number {
  return Math.floor((credits * ratio) / CREDITS_PER_CENT) * CREDITS_PER_CENT;
}

export function effectiveManagedUsageLimit(
  tier: BillingPlanTier,
  catalogVersion: number | null | undefined,
  context: RevenueContext | null | undefined,
): ManagedUsageLimit {
  const limit = managedUsageLimitsForCatalogVersion(catalogVersion)[tier];
  if (limit.unlimited) return limit;
  const ratio = revenueBudgetRatio(tier, context);
  if (ratio === 1) return limit;
  return {
    ...limit,
    monthlyCredits: scaleCredits(limit.monthlyCredits, ratio),
    weeklyCredits: scaleCredits(limit.weeklyCredits, ratio),
    fiveHourCredits: scaleCredits(limit.fiveHourCredits, ratio),
    dailyCredits: scaleCredits(limit.dailyCredits, ratio),
  };
}

export function getEffectivePlanCreditAllowance(
  tier: BillingPlanTier,
  catalogVersion: number | null | undefined,
  context: RevenueContext | null | undefined,
): PlanCreditAllowance {
  return planCreditAllowanceFromLimit(
    tier,
    effectiveManagedUsageLimit(tier, catalogVersion, context),
  );
}
