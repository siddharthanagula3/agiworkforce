import { describe, expect, it } from 'vitest';

import { buildCheckoutTrialParams, resolveCheckoutTrialDays } from './trial-policy';

describe('resolveCheckoutTrialDays', () => {
  it('offers the configured trial only to an account with no subscription history', () => {
    expect(
      resolveCheckoutTrialDays({
        trialDays: 7,
        priorStoreOrStripeSubscription: false,
        customerHasSubscriptionHistory: false,
      }),
    ).toBe(7);
  });

  it('offers none when unconfigured, previously subscribed, or history is unknown', () => {
    const base = {
      trialDays: 7,
      priorStoreOrStripeSubscription: false,
      customerHasSubscriptionHistory: false,
    } as const;
    expect(resolveCheckoutTrialDays({ ...base, trialDays: null })).toBeNull();
    expect(resolveCheckoutTrialDays({ ...base, priorStoreOrStripeSubscription: true })).toBeNull();
    expect(resolveCheckoutTrialDays({ ...base, customerHasSubscriptionHistory: true })).toBeNull();
    expect(resolveCheckoutTrialDays({ ...base, customerHasSubscriptionHistory: null })).toBeNull();
  });
});

describe('buildCheckoutTrialParams', () => {
  it('adds nothing without a trial', () => {
    expect(buildCheckoutTrialParams(null)).toEqual({ session: {}, subscriptionData: {} });
  });
});
