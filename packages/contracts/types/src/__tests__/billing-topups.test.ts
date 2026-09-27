import { describe, expect, it } from 'vitest';
import {
  AUTO_RELOAD_EXTRA_DISCOUNT_PERCENT,
  DAILY_TOP_UP_LIMIT_USD,
  LEGACY_TOP_UP_CONVERSION,
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  TOP_UP_CONVERSION,
  TOP_UP_PRESET_AMOUNTS_USD,
  TOP_UP_UNITS_PER_USD,
  isAutoReloadThresholdCredits,
  isValidAutoReloadSettingsUpdate,
  isValidTopUpPurchase,
  quoteTopUp,
  topUpChargedCents,
  topUpDiscountPercent,
  topUpLedgerCentsForUsd,
  topUpUnitsForUsd,
} from '../billing-topups';

const WORST_CASE_CARD_FEE_PERCENT = 6;
const CARD_FEE_FIXED_CENTS = 30;

function worstCaseCardFeeCents(priceCents: number): number {
  return (priceCents * WORST_CASE_CARD_FEE_PERCENT) / 100 + CARD_FEE_FIXED_CENTS;
}

describe('top-up amounts', () => {
  it('sells 50 credits for every dollar of pack size', () => {
    expect(TOP_UP_UNITS_PER_USD).toBe(50);
    expect(topUpUnitsForUsd(20)).toBe(1_000);
    expect(topUpUnitsForUsd(100)).toBe(5_000);
    expect(topUpUnitsForUsd(0)).toBeNull();
    expect(topUpUnitsForUsd(20.5)).toBeNull();
  });

  it('keeps a pack between $20 and $1,000 with a $2,000 daily limit', () => {
    expect(MIN_TOP_UP_AMOUNT_USD).toBe(20);
    expect(MAX_TOP_UP_AMOUNT_USD).toBe(1_000);
    expect(DAILY_TOP_UP_LIMIT_USD).toBe(2_000);
    expect(quoteTopUp(19)).toBeNull();
    expect(quoteTopUp(1_001)).toBeNull();
    expect(quoteTopUp(25.5)).toBeNull();
  });

  it('funds the credits sold at their provider-cost budget', () => {
    expect(topUpLedgerCentsForUsd(20)).toBe(500);
    expect(topUpLedgerCentsForUsd(100)).toBe(2_500);
  });
});

describe('quoteTopUp', () => {
  it('prices every preset pack at its bracket discount', () => {
    expect(TOP_UP_PRESET_AMOUNTS_USD).toEqual([20, 50, 100, 250, 1_000]);
    expect(
      TOP_UP_PRESET_AMOUNTS_USD.map((amountUsd) => {
        const quote = quoteTopUp(amountUsd);
        return [quote?.credits, quote?.discountPercent, quote?.priceCents];
      }),
    ).toEqual([
      [1_000, 0, 2_000],
      [2_500, 5, 4_750],
      [5_000, 10, 9_000],
      [12_500, 20, 20_000],
      [50_000, 30, 70_000],
    ]);
  });

  it('gives an Other amount the discount of the bracket it falls in', () => {
    expect(quoteTopUp(75)).toMatchObject({ credits: 3_750, discountPercent: 5, priceCents: 7_125 });
    expect(quoteTopUp(999)).toMatchObject({ discountPercent: 20 });
  });

  it('takes an extra 5% off an auto-reload', () => {
    expect(AUTO_RELOAD_EXTRA_DISCOUNT_PERCENT).toBe(5);
    expect(topUpDiscountPercent(100, { autoReload: true })).toBe(15);
    expect(quoteTopUp(100, { autoReload: true })).toMatchObject({
      credits: 5_000,
      priceCents: 8_500,
      autoReload: true,
    });
  });

  it('covers card fees and the provider budget at every amount, manual or auto-reload', () => {
    for (let amountUsd = MIN_TOP_UP_AMOUNT_USD; amountUsd <= MAX_TOP_UP_AMOUNT_USD; amountUsd++) {
      for (const autoReload of [false, true]) {
        const quote = quoteTopUp(amountUsd, { autoReload });
        expect(quote).not.toBeNull();
        if (!quote) continue;
        const margin =
          quote.priceCents - worstCaseCardFeeCents(quote.priceCents) - quote.budgetCents;
        expect(margin).toBeGreaterThan(0);
      }
    }
  });
});

describe('isValidTopUpPurchase', () => {
  it('accepts a v2 record only when it matches the quote', () => {
    const quote = quoteTopUp(50);
    const record = {
      conversion: TOP_UP_CONVERSION,
      amountUsd: 50,
      units: quote?.credits,
      amountCents: quote?.budgetCents,
      priceCents: quote?.priceCents,
    };
    expect(isValidTopUpPurchase(record)).toBe(true);
    expect(topUpChargedCents(record)).toBe(4_750);
    expect(isValidTopUpPurchase({ ...record, priceCents: 5_000 })).toBe(false);
    expect(isValidTopUpPurchase({ ...record, units: 2_600 })).toBe(false);
    expect(isValidTopUpPurchase({ ...record, conversion: 'unknown' })).toBe(false);
  });

  it('still reads a v1 record whose charge equals its budget', () => {
    const legacy = { conversion: LEGACY_TOP_UP_CONVERSION, amountCents: 1_000, units: 500 };
    expect(isValidTopUpPurchase(legacy)).toBe(true);
    expect(topUpChargedCents(legacy)).toBe(1_000);
    expect(isValidTopUpPurchase({ amountCents: 1_000, units: 1_000 })).toBe(false);
  });
});

describe('auto-reload settings', () => {
  it('accepts a whole-credit threshold from 100 to 100,000', () => {
    expect(isAutoReloadThresholdCredits(100)).toBe(true);
    expect(isAutoReloadThresholdCredits(100_000)).toBe(true);
    expect(isAutoReloadThresholdCredits(99)).toBe(false);
    expect(isAutoReloadThresholdCredits(500.5)).toBe(false);
  });

  it('validates an update against the top-up amount rules', () => {
    expect(
      isValidAutoReloadSettingsUpdate({ enabled: true, thresholdCredits: 500, amountUsd: 50 }),
    ).toBe(true);
    expect(
      isValidAutoReloadSettingsUpdate({ enabled: true, thresholdCredits: 500, amountUsd: 10 }),
    ).toBe(false);
    expect(isValidAutoReloadSettingsUpdate({ enabled: 'yes' })).toBe(false);
  });
});
