import { describe, expect, it } from 'vitest';

import {
  BILLING_CURRENCY_TERMS,
  getPlanPriceInr,
  getPlanPriceUsd,
  type BillingPlanTier,
} from '../billing-catalog';
import {
  CARD_PAYMENT_FEES,
  REFERENCE_REVENUE_CONTEXT,
  effectiveManagedUsageLimit,
  getEffectivePlanCreditAllowance,
  monthlyNetRevenueUsd,
  revenueBudgetRatio,
  type RevenueContext,
} from '../billing-revenue';
import { CREDITS_PER_CENT } from '../credits';
import { MANAGED_USAGE_LIMITS } from '../managed-usage-limits';
import {
  BASIS_POINTS_PER_WHOLE,
  MOBILE_IAP_STORE_COMMISSION,
  mobileIapStoreCommissionBasisPoints,
} from '../mobile-iap';

const PAID_TIERS = ['basic', 'pro', 'max', 'max_15x', 'team'] as const;
const INDIA_WEB: RevenueContext = { channel: 'web', currency: 'inr' };
const IOS: RevenueContext = { channel: 'ios', currency: 'usd' };
const ANDROID: RevenueContext = { channel: 'android', currency: 'usd' };

function feeShare(basisPoints: number): number {
  return basisPoints / BASIS_POINTS_PER_WHOLE;
}

function usWebNet(tier: BillingPlanTier): number {
  const price = getPlanPriceUsd(tier, 'monthly')!;
  const share = feeShare(
    CARD_PAYMENT_FEES.cardBasisPoints +
      CARD_PAYMENT_FEES.recurringBillingBasisPoints +
      CARD_PAYMENT_FEES.taxCalculationBasisPoints,
  );
  return price * (1 - share) - CARD_PAYMENT_FEES.fixedUsd;
}

function indiaWebNet(tier: BillingPlanTier): number {
  const terms = BILLING_CURRENCY_TERMS.inr;
  const beforeGst = getPlanPriceInr(tier, 'monthly')! / (1 + terms.includedTax!.rate);
  const share = feeShare(
    CARD_PAYMENT_FEES.cardBasisPoints +
      CARD_PAYMENT_FEES.internationalCardBasisPoints +
      CARD_PAYMENT_FEES.currencyConversionBasisPoints +
      CARD_PAYMENT_FEES.recurringBillingBasisPoints +
      CARD_PAYMENT_FEES.taxCalculationBasisPoints,
  );
  return beforeGst * terms.usdPerUnit.rate * (1 - share) - CARD_PAYMENT_FEES.fixedUsd;
}

describe('revenue budget ratio', () => {
  it.each(PAID_TIERS)('sizes a US web %s subscriber at the full base budget', (tier) => {
    expect(revenueBudgetRatio(tier, REFERENCE_REVENUE_CONTEXT)).toBe(1);
    expect(monthlyNetRevenueUsd(tier, REFERENCE_REVENUE_CONTEXT)).toBeCloseTo(usWebNet(tier), 9);
  });

  it('gives a subscriber with no known region the US budget', () => {
    for (const tier of PAID_TIERS) {
      expect(revenueBudgetRatio(tier, null)).toBe(1);
      expect(effectiveManagedUsageLimit(tier, null, null)).toEqual(MANAGED_USAGE_LIMITS[tier]);
    }
  });

  it.each(PAID_TIERS)(
    'sizes India web %s from the price after the included GST and card fees',
    (tier) => {
      expect(revenueBudgetRatio(tier, INDIA_WEB)).toBeCloseTo(
        indiaWebNet(tier) / usWebNet(tier),
        9,
      );
    },
  );

  it('gives India Basic a smaller budget than US Basic', () => {
    const india = effectiveManagedUsageLimit('basic', null, INDIA_WEB);
    const us = effectiveManagedUsageLimit('basic', null, REFERENCE_REVENUE_CONTEXT);
    expect(revenueBudgetRatio('basic', INDIA_WEB)).toBeLessThan(1);
    expect(india.monthlyCredits).toBeLessThan(us.monthlyCredits);
    expect(india.weeklyCredits).toBeLessThan(us.weeklyCredits);
    expect(india.fiveHourCredits).toBeLessThan(us.fiveHourCredits);
  });

  it('applies the store commission to an App Store or Google Play subscription', () => {
    for (const tier of ['basic', 'pro', 'max', 'max_15x'] as const) {
      const price = getPlanPriceUsd(tier, 'monthly')!;
      const ios = feeShare(MOBILE_IAP_STORE_COMMISSION.ios.subscriptionFirstYearBasisPoints);
      const android = feeShare(
        MOBILE_IAP_STORE_COMMISSION.android.subscriptionFirstYearBasisPoints,
      );
      expect(revenueBudgetRatio(tier, IOS)).toBeCloseTo((price * (1 - ios)) / usWebNet(tier), 9);
      expect(revenueBudgetRatio(tier, ANDROID)).toBeCloseTo(
        (price * (1 - android)) / usWebNet(tier),
        9,
      );
      expect(revenueBudgetRatio(tier, IOS)).toBeLessThan(revenueBudgetRatio(tier, ANDROID));
    }
  });

  it('scales every window and keeps each one a whole number of ledger cents', () => {
    const scaled = effectiveManagedUsageLimit('pro', null, INDIA_WEB);
    for (const credits of [scaled.monthlyCredits, scaled.weeklyCredits, scaled.fiveHourCredits]) {
      expect(credits % CREDITS_PER_CENT).toBe(0);
    }
    const allowance = getEffectivePlanCreditAllowance('pro', null, INDIA_WEB);
    expect(allowance.monthly).toBe(scaled.monthlyCredits);
    expect(allowance.weekly).toBe(scaled.weeklyCredits);
    expect(allowance.fiveHour).toBe(scaled.fiveHourCredits);
  });

  it('leaves an uncapped plan uncapped', () => {
    expect(effectiveManagedUsageLimit('enterprise', null, INDIA_WEB).unlimited).toBe(true);
  });

  it('keeps a plan with no price in that currency on the US budget', () => {
    expect(getPlanPriceInr('team_premium')).toBeNull();
    expect(revenueBudgetRatio('team_premium', INDIA_WEB)).toBe(1);
  });
});

describe('Google Play service fees', () => {
  it('takes 15% of a subscription in every market', () => {
    for (const purchaseCountry of ['US', 'DE', 'IN', null]) {
      expect(
        mobileIapStoreCommissionBasisPoints({
          platform: 'android',
          kind: 'subscription',
          afterFirstYear: false,
          purchaseCountry,
        }),
      ).toBe(1_500);
    }
  });

  it('takes 25% of a top-up in the US, UK and EEA and 30% elsewhere or when unknown', () => {
    const topUp = (purchaseCountry: string | null) =>
      mobileIapStoreCommissionBasisPoints({
        platform: 'android',
        kind: 'top_up',
        afterFirstYear: false,
        purchaseCountry,
      });
    expect(topUp('US')).toBe(2_500);
    expect(topUp('gb')).toBe(2_500);
    expect(topUp('DE')).toBe(2_500);
    expect(topUp('IN')).toBe(3_000);
    expect(topUp(null)).toBe(3_000);
  });

  it('keeps the App Store standard rates', () => {
    const ios = (kind: 'subscription' | 'top_up', afterFirstYear: boolean) =>
      mobileIapStoreCommissionBasisPoints({ platform: 'ios', kind, afterFirstYear });
    expect(ios('subscription', false)).toBe(3_000);
    expect(ios('subscription', true)).toBe(1_500);
    expect(ios('top_up', false)).toBe(3_000);
  });
});
