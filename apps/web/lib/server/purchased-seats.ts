import 'server-only';

import Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { isPerSeatBillingPlan } from '@agiworkforce/types';
import { resolveSubscriptionSeats } from '@/app/api/stripe-webhook/lib/seats';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import { logger } from '@/lib/logger';

/**
 * Seats a buyer has already paid for, recovered at organization-creation time.
 *
 * WHY THIS EXISTS. `persistPurchasedSeatsOnOrganization` writes the purchased
 * seat count onto the buyer's organization, matched by `owner_user_id`. A Team
 * subscription can be — and normally is — bought BEFORE the buyer creates their
 * organization, in which case that write finds no row and returns
 * `no_organization`: the seats are paid for, the entitlement provisions, and
 * the seat count is dropped on the floor. The organization is then inserted
 * with `organizations.licensed_seats` at migration 0085's `default 1`, so a
 * customer who paid for N seats can invite nobody — the second invitation
 * fails the `organizations_seats_within_license` CHECK and the API answers 409
 * "purchase more seats" to someone who already did.
 *
 * The two-seat purchase floor (`MIN_PURCHASABLE_SEATS`) makes that certain
 * rather than merely likely: every Team purchase is now for at least 2 seats,
 * so every organization created after a purchase is under-provisioned.
 *
 * AUTHORITY. The seat count is read live from the Stripe subscription ITEM
 * quantity through `resolveSubscriptionSeats` — the same single derivation site
 * the webhook uses — never from checkout metadata and never from a local
 * snapshot. Organization creation happens once per customer, so the extra
 * Stripe round trip is not on any hot path, and reading live means a seat count
 * changed through the billing portal between purchase and org creation is still
 * correct.
 *
 * FAILURE MODE. Every failure resolves to `null`, which leaves the insert on
 * the migration default exactly as it behaves today. This can under-provision
 * (recoverable: the next `customer.subscription.updated` webhook finds the org
 * and writes the real number) but it can never over-provision, which would hand
 * out seats nobody paid for.
 */
export interface PurchasedSeatProvisioning {
  seats: number;
  planTier: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
}

function getStripeClient(): Stripe | null {
  const secretKey = process.env['STRIPE_SECRET_KEY'];
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

export async function resolvePurchasedSeatsForOwner(
  db: DatabaseAdapter,
  userId: string,
  stripeClient: Pick<Stripe, 'subscriptions'> | null = getStripeClient(),
): Promise<PurchasedSeatProvisioning | null> {
  const subscription = await SubscriptionService.getSubscription(db, userId);
  if (!subscription) return null;
  if (!isPerSeatBillingPlan(subscription.plan_tier)) return null;

  const stripeSubscriptionId = subscription.stripe_subscription_id;
  if (!stripeSubscriptionId) {
    // Store-billed (Apple/Google) or manually provisioned Team plans have no
    // Stripe subscription to read a quantity from. Seats stay at the default.
    logger.warn(
      { userId, planTier: subscription.plan_tier },
      'Per-seat subscription has no Stripe subscription id; organization seats left at the default',
    );
    return null;
  }

  if (!stripeClient) {
    logger.error(
      { userId, stripeSubscriptionId },
      'STRIPE_SECRET_KEY is not configured; cannot adopt purchased seats onto the new organization',
    );
    return null;
  }

  try {
    const stripeSubscription = await stripeClient.subscriptions.retrieve(stripeSubscriptionId);
    const seats = resolveSubscriptionSeats(stripeSubscription);
    const customer = stripeSubscription.customer;
    return {
      seats,
      planTier: subscription.plan_tier,
      stripeSubscriptionId,
      stripeCustomerId: typeof customer === 'string' ? customer : (customer?.id ?? null),
    };
  } catch (error) {
    logger.error(
      { userId, stripeSubscriptionId, error },
      'Failed to read purchased seats from Stripe; organization seats left at the default',
    );
    return null;
  }
}
