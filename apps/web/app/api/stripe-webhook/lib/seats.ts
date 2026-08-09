import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  MAX_PURCHASABLE_SEATS,
  isEntitledSubscriptionStatus,
  isPerSeatBillingPlan,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';

/**
 * The purchased seat count for a Stripe subscription.
 *
 * AUTHORITY: the subscription ITEM quantity, never metadata. Metadata is
 * client-supplied at checkout time and goes stale the moment a seat count is
 * changed through Stripe's billing portal; the item quantity is what Stripe
 * actually bills. This mirrors how `resolvePlanTier` already treats the Price as
 * authoritative over `metadata.plan_tier`.
 *
 * Returns 1 for per-account plans and for anything Stripe reports without a
 * usable quantity, so a missing/garbage value can never inflate a bill.
 */
export function resolveSubscriptionSeats(subscription: {
  items?: { data?: Array<{ quantity?: number | null }> } | null;
}): number {
  const quantity = subscription.items?.data?.[0]?.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) return 1;
  if (quantity < 1) return 1;
  return Math.min(quantity, MAX_PURCHASABLE_SEATS);
}

/** Seat count for a Checkout Session's first line item, using the same rules. */
export function resolveCheckoutSessionSeats(session: {
  line_items?: { data?: Array<{ quantity?: number | null }> } | null;
}): number | null {
  const quantity = session.line_items?.data?.[0]?.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) return null;
  return Math.min(quantity, MAX_PURCHASABLE_SEATS);
}

export interface PurchasedSeatRecord {
  /** Entitlement tier the Price resolved to. */
  planTier: string;
  /** Seats Stripe is billing. Always 1 on per-account tiers. */
  seats: number;
  /** True when this tier is sold by the seat and the count is meaningful. */
  perSeat: boolean;
}

/**
 * Build the seat record a Team purchase must be provisioned from.
 *
 * This is the single place the authoritative number is derived. Do not add a
 * second derivation site — extend this one.
 */
export function buildPurchasedSeatRecord(
  planTier: string,
  subscription: Stripe.Subscription | { items?: { data?: Array<{ quantity?: number | null }> } },
): PurchasedSeatRecord {
  const perSeat = isPerSeatBillingPlan(planTier);
  return {
    planTier,
    seats: perSeat ? resolveSubscriptionSeats(subscription) : 1,
    perSeat,
  };
}

export type SeatPersistenceOutcome =
  | 'persisted'
  | 'no_organization'
  | 'below_consumed_seats'
  | 'subscription_mismatch';

/**
 * Write the PURCHASED seat count onto the buyer's organization.
 *
 * Ownership boundary: this writes `licensed_seats` (what Stripe is billing) and
 * the org-side Stripe anchors ONLY. `seats_consumed` is trigger-maintained by
 * migration 0085 and must never be named here — billing records what was
 * bought, membership records what is used, and the DB CHECK
 * (`seats_consumed <= licensed_seats`) is what keeps them honest.
 *
 * Why the `licensed_seats >= seats_consumed` predicate instead of letting the
 * CHECK fire: this runs inside the webhook's single transaction. A raised
 * 23514 would abort that whole transaction in Postgres — catching it in JS does
 * not recover it — so the event would fail, be retried forever, and the
 * entitlement would never provision. Filtering in the WHERE clause turns an
 * over-subscribed downgrade into a reported no-op instead of a poisoned
 * transaction.
 */
export async function persistPurchasedSeatsOnOrganization(
  db: DatabaseAdapter,
  input: {
    ownerUserId: string;
    seats: number;
    planTier: string;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string | null;
  },
): Promise<SeatPersistenceOutcome> {
  const updated = await db.query<{ id: string; licensed_seats: number }>(
    `update public.organizations
        set licensed_seats = $1,
            billing_plan_tier = $2,
            stripe_subscription_id = coalesce($3, stripe_subscription_id),
            stripe_customer_id = coalesce($4, stripe_customer_id),
            seat_billing_updated_at = now()
      where owner_user_id = $5
        and $1 >= seats_consumed
        and (
          stripe_subscription_id is null
          or $3 is null
          or stripe_subscription_id = $3
        )
      returning id, licensed_seats`,
    [
      input.seats,
      input.planTier,
      input.stripeSubscriptionId,
      input.stripeCustomerId,
      input.ownerUserId,
    ],
  );

  if (updated[0]) {
    logger.info(
      {
        organizationId: updated[0].id,
        ownerUserId: input.ownerUserId,
        licensedSeats: updated[0].licensed_seats,
        planTier: input.planTier,
      },
      'Persisted purchased seat count onto organization',
    );
    return 'persisted';
  }

  // Nothing updated. Work out WHY so operations sees an actionable reason
  // rather than silence — every branch here is a real, distinct situation.
  const existing = await db.query<{
    id: string;
    seats_consumed: number;
    stripe_subscription_id: string | null;
  }>(
    `select id, seats_consumed, stripe_subscription_id
       from public.organizations
      where owner_user_id = $1
      limit 1`,
    [input.ownerUserId],
  );
  const organization = existing[0];

  if (!organization) {
    // The buyer has not created an organization yet — the normal order, since
    // creating one requires a Team plan. Seats are paid for and the entitlement
    // is provisioned; the count is read back from Stripe by
    // `resolvePurchasedSeatsForOwner` when the organization is created.
    logger.warn(
      { ownerUserId: input.ownerUserId, seats: input.seats, planTier: input.planTier },
      'Per-seat subscription has no organization to attach seats to yet',
    );
    return 'no_organization';
  }

  if (
    input.stripeSubscriptionId &&
    organization.stripe_subscription_id &&
    organization.stripe_subscription_id !== input.stripeSubscriptionId
  ) {
    logger.error(
      {
        organizationId: organization.id,
        ownerUserId: input.ownerUserId,
        boundSubscriptionId: organization.stripe_subscription_id,
        incomingSubscriptionId: input.stripeSubscriptionId,
      },
      'CRITICAL: per-seat event targets an organization already bound to a different Stripe subscription',
    );
    return 'subscription_mismatch';
  }

  logger.error(
    {
      organizationId: organization.id,
      ownerUserId: input.ownerUserId,
      purchasedSeats: input.seats,
      seatsConsumed: organization.seats_consumed,
    },
    'CRITICAL: purchased seat count is below the seats already occupied; licensed_seats left unchanged',
  );
  return 'below_consumed_seats';
}

/** The only Stripe surface a seat read-back needs. */
export type SubscriptionSeatReader = Pick<Stripe, 'subscriptions'>;

export interface OwnerPurchasedSeats {
  /** Seats Stripe is billing this owner right now. */
  seats: number;
  /** Per-seat tier the subscription is recorded at. */
  planTier: string;
}

/**
 * Read back the seat count an owner has ALREADY paid for.
 *
 * Every purchase precedes the organization it pays for — creating one requires
 * a Team plan — so `persistPurchasedSeatsOnOrganization` reports
 * `no_organization` for a first-time buyer and nothing writes `licensed_seats`
 * afterwards. Stripe is the only record of the quantity at that point: the
 * subscriptions table has no seat column, and checkout metadata is neither
 * durable nor authoritative. Provisioning therefore reads the subscription item
 * back here, under the same authority rule as every other seat derivation.
 *
 * Reports the seat count and the tier it was bought under — NOT the Stripe
 * anchors. Binding an organization to a subscription id stays with the webhook,
 * which owns `idx_organizations_stripe_subscription`'s uniqueness.
 *
 * Returns null when there is nothing per-seat to reconcile. THROWS when Stripe
 * cannot be reached — the caller must refuse to provision rather than create an
 * organization capped below what was bought, because `licensed_seats` cannot be
 * raised again from the product.
 */
export async function resolvePurchasedSeatsForOwner(
  db: DatabaseAdapter,
  getStripe: () => SubscriptionSeatReader,
  ownerUserId: string,
): Promise<OwnerPurchasedSeats | null> {
  const [row] = await db.query<{
    plan_tier: string | null;
    status: string | null;
    stripe_subscription_id: string | null;
  }>(
    `select plan_tier, status, stripe_subscription_id
       from public.subscriptions
      where user_id = $1
      limit 1`,
    [ownerUserId],
  );

  if (!row?.stripe_subscription_id) return null;
  // Same entitlement rule the capability gate uses, so a subscription that
  // grants Team administration and one that grants seats cannot disagree.
  if (!isEntitledSubscriptionStatus(row.status)) return null;
  const planTier = row.plan_tier ?? '';
  if (!isPerSeatBillingPlan(planTier)) return null;

  const subscription = await getStripe().subscriptions.retrieve(row.stripe_subscription_id);
  const purchased = buildPurchasedSeatRecord(planTier, subscription);

  return { seats: purchased.seats, planTier };
}
