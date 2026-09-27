import { describe, expect, it } from 'vitest';
import {
  CENTS_PER_CREDIT,
  CREDITS_PER_CENT,
  CREDITS_PER_USD,
  MICROUSD_PER_CREDIT,
  centsFromCredits,
  chargeCreditsForMicrousd,
  creditsFromCents,
  creditsFromMicrousd,
  formatCredits,
  formatCreditsPerMillionTokens,
  microusdFromCredits,
  usdFromCredits,
} from '../credits';

describe('credits identities', () => {
  it('holds one credit as 5,000 microUSD of provider cost', () => {
    expect(MICROUSD_PER_CREDIT).toBe(5_000);
    expect(microusdFromCredits(1)).toBe(5_000);
    expect(creditsFromMicrousd(5_000)).toBe(1);
  });

  it('holds 200 credits to the dollar of provider cost', () => {
    expect(CREDITS_PER_USD).toBe(200);
    expect(usdFromCredits(200)).toBe(1);
  });

  it('holds one credit as half a cent', () => {
    expect(CENTS_PER_CREDIT).toBe(0.5);
    expect(CREDITS_PER_CENT).toBe(2);
    expect(centsFromCredits(1)).toBe(0.5);
    expect(creditsFromCents(1)).toBe(2);
  });

  it('holds the Pro allowance of 2,000 credits as ten dollars of provider cost', () => {
    expect(centsFromCredits(2_000)).toBe(1_000);
    expect(usdFromCredits(2_000)).toBe(10);
  });
});

describe('chargeCreditsForMicrousd', () => {
  it('charges provider cost divided by the credit size', () => {
    expect(chargeCreditsForMicrousd(5_000)).toBe(1);
    expect(chargeCreditsForMicrousd(10_000)).toBe(2);
  });

  it('rounds any remainder up to the next hundredth of a credit', () => {
    expect(chargeCreditsForMicrousd(1)).toBe(0.01);
    expect(chargeCreditsForMicrousd(5_001)).toBe(1.01);
  });

  it('never charges less than the provider cost', () => {
    for (const microusd of [1, 49, 50, 51, 4_999, 5_001, 67_000, 123_457, 1_000_001]) {
      expect(microusdFromCredits(chargeCreditsForMicrousd(microusd))).toBeGreaterThanOrEqual(
        microusd,
      );
    }
  });

  it('charges nothing for a zero, negative or non-finite cost', () => {
    expect(chargeCreditsForMicrousd(0)).toBe(0);
    expect(chargeCreditsForMicrousd(-5)).toBe(0);
    expect(chargeCreditsForMicrousd(Number.NaN)).toBe(0);
    expect(chargeCreditsForMicrousd(Number.POSITIVE_INFINITY)).toBe(0);
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
    expect(formatCreditsPerMillionTokens(2)).toBe(400);
  });
});
