import 'server-only';

import type Stripe from 'stripe';

import { logger } from '@/lib/logger';

export type StoredSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'none';

const STORED_STATUS_BY_STRIPE_STATUS: Record<Stripe.Subscription.Status, StoredSubscriptionStatus> =
  {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
    unpaid: 'unpaid',
    paused: 'unpaid',
  };

export function toStoredSubscriptionStatus(status: string): StoredSubscriptionStatus {
  const stored = STORED_STATUS_BY_STRIPE_STATUS[status as Stripe.Subscription.Status];
  if (stored) {
    return stored;
  }

  logger.error(
    { status },
    'Unknown Stripe subscription status; storing "unpaid" so the event can commit. Add it to STORED_STATUS_BY_STRIPE_STATUS and to the subscriptions.status CHECK constraint.',
  );
  return 'unpaid';
}
