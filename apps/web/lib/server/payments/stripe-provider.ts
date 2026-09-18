import 'server-only';

import type Stripe from 'stripe';

import { logger } from '@/lib/logger';
import { getStripeClient, getStripeClientOrNull } from '@/lib/server/stripe-client';
import {
  isStripeCheckoutSessionId,
  isStripeSubscriptionId,
} from '@/lib/server/stripe-resource-ids';
import { getSubscriptionPeriod } from '@/lib/stripe-types';

import type {
  NormalizedPurchase,
  NormalizedSubscription,
  PollablePaymentProvider,
  PurchaseVerificationInput,
} from './domain';
import {
  normalizeCurrency,
  normalizeEnvironment,
  normalizeInterval,
  normalizeMoney,
  normalizeProviderPeriod,
  normalizeProviderQuantity,
  normalizeProviderTimestamp,
  normalizeSubscriptionStatus,
} from './normalize';

const PROVIDER_ID = 'stripe' as const;
const OWNER_METADATA_KEY = 'user_id';
const PLAN_TIER_METADATA_KEY = 'plan_tier';

const CAPABILITIES = {
  pollsSubscriptionState: true,
  hostedBillingPortal: true,
} as const;

function referenceOf(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : (value.id ?? null);
}

function stripeEnvironment(livemode: boolean | null | undefined): 'production' | 'sandbox' {
  return normalizeEnvironment(livemode === false ? 'sandbox' : 'production');
}

export function normalizeStripeSubscription(
  subscription: Stripe.Subscription,
): NormalizedSubscription {
  const item = subscription.items?.data?.[0];
  const price = item?.price;
  const period = getSubscriptionPeriod(subscription);
  const { status, mapped } = normalizeSubscriptionStatus(PROVIDER_ID, subscription.status);
  if (!mapped) {
    logger.error(
      { subscriptionId: subscription.id, status: subscription.status },
      'Unknown Stripe subscription status; normalized to unpaid so no unearned entitlement is granted',
    );
  }

  return {
    provider: PROVIDER_ID,
    subscriptionReference: subscription.id,
    customerReference: referenceOf(subscription.customer as string | { id?: string } | null),
    ownerReference: subscription.metadata?.[OWNER_METADATA_KEY]?.trim() || null,
    plan: {
      productReference: referenceOf(price?.product as string | { id?: string } | null | undefined),
      priceReference: price?.id ?? null,
    },
    status,
    period: period ? normalizeProviderPeriod(period.start, period.end) : null,
    interval: normalizeInterval(price?.recurring?.interval, price?.recurring?.interval_count),
    quantity: normalizeProviderQuantity(item?.quantity),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    endedAt: normalizeProviderTimestamp(subscription.ended_at),
    environment: stripeEnvironment(subscription.livemode),
  };
}

export function normalizeStripeCheckoutSession(
  session: Stripe.Checkout.Session,
): NormalizedPurchase {
  const state =
    session.payment_status === 'paid'
      ? 'paid'
      : session.status === 'complete'
        ? 'confirmed'
        : session.status === 'expired'
          ? 'expired'
          : 'processing';

  return {
    provider: PROVIDER_ID,
    purchaseReference: session.id,
    ownerReference:
      session.client_reference_id ?? session.metadata?.[OWNER_METADATA_KEY]?.trim() ?? null,
    plan: {
      productReference: null,
      priceReference: referenceOf(
        session.line_items?.data?.[0]?.price as string | { id?: string } | null | undefined,
      ),
    },
    planTier: session.metadata?.[PLAN_TIER_METADATA_KEY]?.trim() || null,
    state,
    purchasedAt: normalizeProviderTimestamp(session.created),
    expiresAt: normalizeProviderTimestamp(session.expires_at),
    quantity: normalizeProviderQuantity(1),
    amount: normalizeMoney(session.amount_total, normalizeCurrency(session.currency)),
    environment: stripeEnvironment(session.livemode),
  };
}

export const stripePaymentProvider: PollablePaymentProvider = {
  id: PROVIDER_ID,
  capabilities: CAPABILITIES,

  async verifyPurchase(input: PurchaseVerificationInput): Promise<NormalizedPurchase> {
    if (!isStripeCheckoutSessionId(input.reference)) {
      throw new Error('A Stripe checkout session reference is required.');
    }
    const session = await getStripeClient().checkout.sessions.retrieve(input.reference);
    return normalizeStripeCheckoutSession(session);
  },

  async readSubscription(reference: string): Promise<NormalizedSubscription | null> {
    if (!isStripeSubscriptionId(reference)) return null;
    const stripe = getStripeClientOrNull();
    if (!stripe) return null;
    const subscription = await stripe.subscriptions.retrieve(reference);
    return normalizeStripeSubscription(subscription);
  },
};
