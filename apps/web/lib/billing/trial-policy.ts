import type Stripe from 'stripe';

export interface TrialEligibilityInput {
  trialDays: number | null;
  priorStoreOrStripeSubscription: boolean;
  customerHasSubscriptionHistory: boolean | null;
}

export function resolveCheckoutTrialDays(input: TrialEligibilityInput): number | null {
  if (input.trialDays === null) return null;
  if (input.priorStoreOrStripeSubscription) return null;
  if (input.customerHasSubscriptionHistory !== false) return null;
  return input.trialDays;
}

export function buildCheckoutTrialParams(trialDays: number | null): {
  session: Pick<Stripe.Checkout.SessionCreateParams, 'payment_method_collection'>;
  subscriptionData: Pick<
    Stripe.Checkout.SessionCreateParams.SubscriptionData,
    'trial_period_days' | 'trial_settings'
  >;
} {
  if (trialDays === null) return { session: {}, subscriptionData: {} };
  return {
    session: { payment_method_collection: 'always' },
    subscriptionData: {
      trial_period_days: trialDays,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    },
  };
}
