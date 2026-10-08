import { describe, expect, it } from 'vitest';
import { MIN_PURCHASABLE_SEATS } from '@agiworkforce/types';
import {
  CheckoutRequestSchema,
  UpgradeApplyRequestSchema,
  UpgradePreviewRequestSchema,
  resolveCheckoutSeatQuantities,
} from '../checkout';

function issuePaths(result: ReturnType<typeof CheckoutRequestSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

const TEAM = { plan: 'team', billingInterval: 'monthly' } as const;

describe('Premium seats in a checkout request', () => {
  it('accepts a team that mixes both seat types', () => {
    expect(CheckoutRequestSchema.safeParse({ ...TEAM, seats: 5, premiumSeats: 2 }).success).toBe(
      true,
    );
  });

  it('accepts a team of only Premium seats, and one with none', () => {
    expect(CheckoutRequestSchema.safeParse({ ...TEAM, seats: 3, premiumSeats: 3 }).success).toBe(
      true,
    );
    expect(CheckoutRequestSchema.safeParse({ ...TEAM, seats: 3, premiumSeats: 0 }).success).toBe(
      true,
    );
  });

  it('counts Premium seats inside the seat total, never on top of it', () => {
    const result = CheckoutRequestSchema.safeParse({ ...TEAM, seats: 3, premiumSeats: 4 });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('premiumSeats');
  });

  it('refuses negative and fractional Premium seat counts', () => {
    for (const premiumSeats of [-1, 0.5, Number.NaN]) {
      expect(CheckoutRequestSchema.safeParse({ ...TEAM, seats: 3, premiumSeats }).success).toBe(
        false,
      );
    }
  });

  it('refuses Premium seats on a plan that is not billed per seat', () => {
    const result = CheckoutRequestSchema.safeParse({
      plan: 'max',
      billingInterval: 'monthly',
      premiumSeats: 1,
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('premiumSeats');
  });

  it('does not accept the Premium seat tier as a plan to buy', () => {
    expect(
      CheckoutRequestSchema.safeParse({
        plan: 'team_premium',
        billingInterval: 'monthly',
        seats: 2,
      }).success,
    ).toBe(false);
  });

  it('keeps the two-seat minimum on the total, whatever the mix', () => {
    expect(CheckoutRequestSchema.safeParse({ ...TEAM, seats: 1, premiumSeats: 1 }).success).toBe(
      false,
    );
    expect(
      CheckoutRequestSchema.safeParse({
        ...TEAM,
        seats: MIN_PURCHASABLE_SEATS,
        premiumSeats: 1,
      }).success,
    ).toBe(true);
  });

  it('keeps the seat increase request free of a Premium count, because added seats are Standard', () => {
    expect(
      UpgradePreviewRequestSchema.safeParse({ ...TEAM, seats: 5, premiumSeats: 1 }).success,
    ).toBe(false);
    expect(
      UpgradeApplyRequestSchema.safeParse({
        ...TEAM,
        seats: 5,
        premiumSeats: 1,
        previewToken: 'token',
      }).success,
    ).toBe(false);
  });
});

describe('resolveCheckoutSeatQuantities', () => {
  it('splits the total into Standard and Premium seats', () => {
    expect(resolveCheckoutSeatQuantities({ plan: 'team', seats: 5, premiumSeats: 2 })).toEqual({
      standard: 3,
      premium: 2,
    });
    expect(resolveCheckoutSeatQuantities({ plan: 'team', seats: 4 })).toEqual({
      standard: 4,
      premium: 0,
    });
  });

  it('never lets Premium seats exceed the total', () => {
    expect(resolveCheckoutSeatQuantities({ plan: 'team', seats: 2, premiumSeats: 9 })).toEqual({
      standard: 0,
      premium: 2,
    });
  });

  it('gives a per-account plan one Standard quantity and no Premium seats', () => {
    expect(resolveCheckoutSeatQuantities({ plan: 'pro', premiumSeats: 3 })).toEqual({
      standard: 1,
      premium: 0,
    });
  });
});
