import 'server-only';

import type Stripe from 'stripe';

import { logger } from '@/lib/logger';

/**
 * The only values `public.subscriptions.status` can hold.
 *
 * Mirrors the CHECK constraint created in
 * `apps/web/db/neon/0003_subscriptions.sql` (no later migration widens it).
 */
export type StoredSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'none';

/**
 * Stripe's subscription vocabulary projected onto the column's vocabulary.
 *
 * Stripe has one status the column cannot store: `paused`, which Stripe sets
 * when a trial ends and the customer left no payment method
 * (`trial_settings.end_behavior.missing_payment_method = 'pause'`). Writing it
 * verbatim raises Postgres 23514 on the CHECK constraint; the webhook runs
 * inside one transaction (see ../route.ts), so the whole event rolls back, is
 * marked failed, and every Stripe retry fails identically. The row therefore
 * keeps the status it had — `trialing` or `active` — and since entitlement is
 * read from `status` (lib/entitlement.ts), a subscription Stripe has STOPPED
 * collecting for keeps full paid access until a human notices.
 *
 * `unpaid` carries the part that decides access: Stripe is not collecting on
 * this subscription and the account is not entitled. It is also non-terminal,
 * unlike `canceled`, which the ordering guard in
 * `updateSubscriptionFromStripeSubscription` refuses to move off — so a paused
 * subscription that later resumes is re-derived normally from its next event.
 *
 * This is a projection, not a substitute for storing the truth: widening the
 * CHECK constraint to accept `paused` turns this entry into the identity
 * mapping and makes the "Paused" label the billing UI already renders
 * (features/billing/components/Billing/Subscription.tsx) reachable.
 *
 * Keyed by Stripe's own union so a status introduced by a future SDK or API
 * version fails this file's build instead of failing in Postgres at 2am.
 */
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

/**
 * Convert a Stripe subscription status into the status the database accepts.
 *
 * Unknown values (a Stripe API version newer than the pinned SDK types) are
 * failed closed to `unpaid` rather than written through: an unstorable status
 * aborts the event and leaves the previous, possibly entitled, status in place.
 */
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
