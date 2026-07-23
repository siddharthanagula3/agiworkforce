import { describe, expect, it } from 'vitest';

import { isStripeCustomerId, isStripeSubscriptionId } from './stripe-resource-ids';

describe('Stripe resource IDs', () => {
  it('recognizes live Stripe subscription IDs and rejects seeded placeholders', () => {
    expect(isStripeSubscriptionId('sub_1AbCdEfGhIjKlMn')).toBe(true);
    expect(isStripeSubscriptionId('TEST_TEMP_CLAUDE')).toBe(false);
    expect(isStripeSubscriptionId(null)).toBe(false);
  });

  it('recognizes live Stripe customer IDs and rejects seeded placeholders', () => {
    expect(isStripeCustomerId('cus_AbCdEfGhIjKlMn')).toBe(true);
    expect(isStripeCustomerId('TEST_CUSTOMER')).toBe(false);
    expect(isStripeCustomerId(undefined)).toBe(false);
  });
});
