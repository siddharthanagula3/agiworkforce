import { describe, expect, it } from 'vitest';
import {
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  TOP_UP_UNITS_PER_USD,
  isValidTopUpPurchase,
  topUpLedgerCentsForUsd,
  topUpUnitsForUsd,
} from '../billing-topups';

describe('billing top-ups', () => {
  it('grants exactly 50 top-up units for every whole dollar', () => {
    expect(TOP_UP_UNITS_PER_USD).toBe(50);
    expect(topUpUnitsForUsd(10)).toBe(500);
    expect(topUpUnitsForUsd(20)).toBe(1_000);
    expect(topUpLedgerCentsForUsd(10)).toBe(1_000);
  });

  it('requires at least $10 and a whole-dollar amount', () => {
    expect(MIN_TOP_UP_AMOUNT_USD).toBe(10);
    expect(MAX_TOP_UP_AMOUNT_USD).toBe(100);
    expect(topUpUnitsForUsd(9)).toBeNull();
    expect(topUpUnitsForUsd(10.5)).toBeNull();
    expect(topUpUnitsForUsd(MAX_TOP_UP_AMOUNT_USD + 1)).toBeNull();
  });

  it('validates the charged cents and public units as one canonical tuple', () => {
    expect(isValidTopUpPurchase({ amountCents: 1_000, units: 500 })).toBe(true);
    expect(isValidTopUpPurchase({ amountCents: 1_000, units: 1_000 })).toBe(false);
    expect(isValidTopUpPurchase({ amountCents: 999, units: 500 })).toBe(false);
  });
});
