import type Stripe from 'stripe';

import { startTrial } from './trial-entitlement';

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

/**
 * One answer for a checkout that may include a trial: whether this buyer gets
 * one, the Stripe parameters, and the local trial record that says what they
 * are entitled to until it ends. Resolving them separately is how a session
 * shipped with `trial_period_days` set and nothing on this side recording it.
 */
export function planCheckoutTrial(
  input: TrialEligibilityInput & { trialedPlan: string; startedAtMs: number },
): {
  trialDays: number | null;
  stripe: ReturnType<typeof buildCheckoutTrialParams>;
  record: ReturnType<typeof startTrial>;
} {
  const trialDays = resolveCheckoutTrialDays(input);
  return {
    trialDays,
    stripe: buildCheckoutTrialParams(trialDays),
    record: startTrial({
      trialedPlan: input.trialedPlan,
      trialDays,
      startedAtMs: input.startedAtMs,
    }),
  };
}
