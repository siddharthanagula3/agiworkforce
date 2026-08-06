import { describe, expect, it } from 'vitest';
import { MAX_PURCHASABLE_SEATS } from '@agiworkforce/types';
import {
  CheckoutRequestSchema,
  UpgradeApplyRequestSchema,
  resolveCheckoutQuantity,
} from '../checkout';

function issuePaths(result: ReturnType<typeof CheckoutRequestSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('checkout seat validation', () => {
  it('accepts Team with an explicit seat count', () => {
    const result = CheckoutRequestSchema.safeParse({
      plan: 'team',
      billingInterval: 'monthly',
      seats: 12,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.seats).toBe(12);
  });

  it('refuses Team without a seat count instead of quietly billing one seat', () => {
    const result = CheckoutRequestSchema.safeParse({ plan: 'team', billingInterval: 'monthly' });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('seats');
  });

  it('refuses a seat count on a per-account plan', () => {
    // Accepting it would multiply a personal plan's price by a client-chosen
    // integer — the same defect as dropping the seat count on Team, inverted.
    const result = CheckoutRequestSchema.safeParse({
      plan: 'pro',
      billingInterval: 'monthly',
      seats: 40,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('seats');
  });

  it('refuses zero, negative, fractional, and out-of-range seat counts', () => {
    for (const seats of [0, -3, 2.5, MAX_PURCHASABLE_SEATS + 1]) {
      const result = CheckoutRequestSchema.safeParse({
        plan: 'team',
        billingInterval: 'monthly',
        seats,
      });
      expect(result.success, `seats=${seats} must be rejected`).toBe(false);
    }
  });

  it('accepts yearly Team with a seat count (Team is sold monthly and yearly, Decision #22)', () => {
    const result = CheckoutRequestSchema.safeParse({
      plan: 'team',
      billingInterval: 'yearly',
      seats: 5,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.seats).toBe(5);
  });

  it('still refuses yearly for a truly monthly-only plan (max)', () => {
    const result = CheckoutRequestSchema.safeParse({
      plan: 'max',
      billingInterval: 'yearly',
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('billingInterval');
  });

  it('still refuses unknown fields on the strict schema', () => {
    const result = CheckoutRequestSchema.safeParse({
      plan: 'team',
      billingInterval: 'monthly',
      seats: 2,
      quantity: 99,
    });
    expect(result.success).toBe(false);
  });

  it('carries the same seat rules into the upgrade-apply schema', () => {
    expect(
      UpgradeApplyRequestSchema.safeParse({
        plan: 'team',
        billingInterval: 'monthly',
        previewToken: 'token',
      }).success,
    ).toBe(false);
    expect(
      UpgradeApplyRequestSchema.safeParse({
        plan: 'team',
        billingInterval: 'monthly',
        seats: 4,
        previewToken: 'token',
      }).success,
    ).toBe(true);
  });
});

describe('resolveCheckoutQuantity', () => {
  it('returns the seat count for per-seat plans', () => {
    expect(resolveCheckoutQuantity({ plan: 'team', seats: 25 })).toBe(25);
  });

  it('returns 1 for per-account plans regardless of a stray seat value', () => {
    // Defence in depth: the schema already rejects seats on these plans, so this
    // guarantees the quantity sent to Stripe is 1 even if a caller bypasses it.
    expect(resolveCheckoutQuantity({ plan: 'pro', seats: 25 })).toBe(1);
    expect(resolveCheckoutQuantity({ plan: 'max_15x' })).toBe(1);
  });

  it('never returns 0 or a negative quantity', () => {
    expect(resolveCheckoutQuantity({ plan: 'team' })).toBe(1);
  });
});
