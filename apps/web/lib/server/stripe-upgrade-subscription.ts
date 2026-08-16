import 'server-only';

import type Stripe from 'stripe';
import { resolvePlanTier } from '@/lib/price-tier-mapping';
import { isStripeCustomerId, isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';

export interface StoredUpgradeSubscription {
  planTier: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export interface ResolvedUpgradeSubscription {
  subscription: Stripe.Subscription;
  recovered: boolean;
}

function isResourceMissing(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'resource_missing'
  );
}

function customerIdOf(subscription: Stripe.Subscription): string | null {
  return typeof subscription.customer === 'string'
    ? subscription.customer
    : (subscription.customer?.id ?? null);
}

function isOwnedCurrentPlanSubscription(
  subscription: Stripe.Subscription,
  stored: StoredUpgradeSubscription,
  userId: string,
  requireCurrentPlan: boolean,
): boolean {
  if (!['active', 'trialing'].includes(subscription.status)) return false;
  if (
    isStripeCustomerId(stored.stripeCustomerId) &&
    customerIdOf(subscription) !== stored.stripeCustomerId
  ) {
    return false;
  }

  const metadataUserId = subscription.metadata?.['user_id'];
  if (metadataUserId && metadataUserId !== userId) return false;

  if (!requireCurrentPlan) return true;
  const priceId = subscription.items.data[0]?.price.id;
  return resolvePlanTier(subscription.metadata, priceId) === stored.planTier;
}

export async function resolveStripeSubscriptionForUpgrade(
  stripe: Stripe,
  stored: StoredUpgradeSubscription,
  userId: string,
): Promise<ResolvedUpgradeSubscription | null> {
  if (isStripeSubscriptionId(stored.stripeSubscriptionId)) {
    try {
      const subscription = await stripe.subscriptions.retrieve(stored.stripeSubscriptionId, {
        expand: ['items.data.price'],
      });
      if (isOwnedCurrentPlanSubscription(subscription, stored, userId, false)) {
        return { subscription, recovered: false };
      }
      return null;
    } catch (error) {
      if (!isResourceMissing(error)) throw error;
    }
  }

  if (!isStripeCustomerId(stored.stripeCustomerId)) return null;

  const subscriptions = await stripe.subscriptions.list({
    customer: stored.stripeCustomerId,
    status: 'all',
    limit: 10,
    expand: ['data.items.data.price'],
  });
  const subscription = subscriptions.data.find((candidate) =>
    isOwnedCurrentPlanSubscription(candidate, stored, userId, true),
  );

  return subscription ? { subscription, recovered: true } : null;
}
