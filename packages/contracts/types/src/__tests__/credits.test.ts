import { describe, expect, it } from 'vitest';
import {
  CENTS_PER_CREDIT,
  CREDITS_PER_USD,
  MICROUSD_PER_CREDIT,
  centsFromCredits,
  creditsFromCents,
  creditsFromMicrousd,
  formatCredits,
  formatCreditsPerMillionTokens,
  microusdFromCredits,
  usdFromCredits,
} from '../credits';
import { TOP_UP_UNITS_PER_USD } from '../billing-topups';

describe('credits identities', () => {
  it('holds 50 credits to the dollar', () => {
    expect(CREDITS_PER_USD).toBe(50);
    expect(usdFromCredits(50)).toBe(1);
  });

  it('holds one credit as two cents', () => {
    expect(CENTS_PER_CREDIT).toBe(2);
    expect(centsFromCredits(1)).toBe(2);
    expect(creditsFromCents(2)).toBe(1);
  });

  it('holds five hundred credits as ten dollars', () => {
    expect(centsFromCredits(500)).toBe(1_000);
    expect(usdFromCredits(500)).toBe(10);
  });

  it('holds one credit as twenty thousand microUSD', () => {
    expect(MICROUSD_PER_CREDIT).toBe(20_000);
    expect(microusdFromCredits(1)).toBe(20_000);
    expect(creditsFromMicrousd(20_000)).toBe(1);
  });

  it('holds four internal usage units per credit at the documented 5,000 microUSD unit price', () => {
    const MICROUSD_PER_INTERNAL_USAGE_UNIT = 5_000;
    expect(MICROUSD_PER_CREDIT / MICROUSD_PER_INTERNAL_USAGE_UNIT).toBe(4);
  });

  it('keeps TOP_UP_UNITS_PER_USD equal to CREDITS_PER_USD', () => {
    expect(TOP_UP_UNITS_PER_USD).toBe(CREDITS_PER_USD);
  });
});

describe('formatCredits', () => {
  it('pluralizes and rounds to one fraction digit by default', () => {
    expect(formatCredits(1)).toBe('1 credit');
    expect(formatCredits(423.71)).toBe('423.7 credits');
    expect(formatCredits(0)).toBe('0 credits');
  });

  it('accepts a maximumFractionDigits override', () => {
    expect(formatCredits(423.716, { maximumFractionDigits: 2 })).toBe('423.72 credits');
  });
});

describe('formatCreditsPerMillionTokens', () => {
  it('converts a per-million-token USD rate into credits', () => {
    expect(formatCreditsPerMillionTokens(2)).toBe(100);
  });
});
