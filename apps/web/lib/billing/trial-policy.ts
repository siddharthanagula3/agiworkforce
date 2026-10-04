import type Stripe from 'stripe';
import { getPlanTrialDays } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { isBillingNoticeEmailConfigured } from '@/lib/services/billing-notice-service';

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

export async function customerHasSubscriptionHistory(
  stripe: Stripe,
  customerId: string,
  userId: string,
): Promise<boolean | null> {
  try {
    const page = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 1 });
    return page.data.length > 0;
  } catch (error) {
    logger.warn(
      { error, userId, customerId },
      'Trial eligibility could not be verified; checkout continues without a trial',
    );
    return null;
  }
}

export async function resolveTrialDaysForCheckout(input: {
  stripe: Stripe;
  plan: string;
  userId: string;
  stripeCustomerId: string | null;
  referralTrialDays: number | null;
  existingSubscription: Pick<
    SubscriptionRow,
    'stripe_subscription_id' | 'apple_original_transaction_id' | 'google_purchase_token'
  > | null;
}): Promise<number | null> {
  const trialDays = getPlanTrialDays(input.plan) ?? input.referralTrialDays;
  if (trialDays === null) return null;
  const existing = input.existingSubscription;
  const eligibleDays = resolveCheckoutTrialDays({
    trialDays,
    priorStoreOrStripeSubscription: Boolean(
      existing?.stripe_subscription_id ||
      existing?.apple_original_transaction_id ||
      existing?.google_purchase_token,
    ),
    customerHasSubscriptionHistory: input.stripeCustomerId
      ? await customerHasSubscriptionHistory(input.stripe, input.stripeCustomerId, input.userId)
      : false,
  });
  if (eligibleDays !== null && !isBillingNoticeEmailConfigured()) {
    logger.error(
      { userId: input.userId, plan: input.plan },
      'Billing notice email is not configured, so a trial could not be reminded; checkout continues without a trial',
    );
    return null;
  }
  return eligibleDays;
}
