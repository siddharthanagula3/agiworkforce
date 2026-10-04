import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stripe } from '@/lib/stripe-types';
type LoggerModule = typeof import('@/lib/logger');

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: loggerMocks,
}));

import {
  buildCheckoutTrialParams,
  resolveCheckoutTrialDays,
  resolveTrialDaysForCheckout,
} from './trial-policy';

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

describe('resolveTrialDaysForCheckout', () => {
  const stripe = {} as Stripe;
  const firstTimeReferredSubscriber = {
    stripe,
    plan: 'pro',
    userId: 'user_123',
    stripeCustomerId: null,
    referralTrialDays: 7,
    existingSubscription: null,
  } as const;

  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('AGI_NOTIFICATIONS_FROM_EMAIL', 'AGI Workforce <notifications@agiworkforce.test>');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('grants the referral trial when the reminder can be emailed', async () => {
    expect(await resolveTrialDaysForCheckout(firstTimeReferredSubscriber)).toBe(7);
    expect(loggerMocks.error).not.toHaveBeenCalled();
  });

  it.each([
    ['the notifications sender address', 'AGI_NOTIFICATIONS_FROM_EMAIL'],
    ['the email provider key', 'RESEND_API_KEY'],
  ])('grants no trial and logs an error without %s', async (_missing, variable) => {
    vi.stubEnv(variable, '');

    expect(await resolveTrialDaysForCheckout(firstTimeReferredSubscriber)).toBeNull();
    expect(loggerMocks.error).toHaveBeenCalledWith(
      { userId: 'user_123', plan: 'pro' },
      expect.stringContaining('Billing notice email is not configured'),
    );
  });

  it('stays quiet about the sender when the account was not eligible for a trial anyway', async () => {
    vi.stubEnv('AGI_NOTIFICATIONS_FROM_EMAIL', '');

    expect(
      await resolveTrialDaysForCheckout({
        ...firstTimeReferredSubscriber,
        existingSubscription: {
          stripe_subscription_id: 'sub_1OldSubscriptionAbc123',
          apple_original_transaction_id: null,
          google_purchase_token: null,
        },
      }),
    ).toBeNull();
    expect(loggerMocks.error).not.toHaveBeenCalled();
  });
});
