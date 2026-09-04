import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  MAX_PURCHASABLE_SEATS,
  isEntitledSubscriptionStatus,
  isEntitledSubscriptionStatusForTier,
  isPerSeatBillingPlan,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { readOrganizationCollectionState } from '@/lib/services/enterprise-collection-state';

const ENTERPRISE_PLAN_TIER = 'enterprise';
const SEAT_EXPANSION_BLOCKED_AUDIT_REASON = 'seat_expansion_blocked';

export function resolveSubscriptionSeats(subscription: {
  items?: { data?: Array<{ quantity?: number | null }> } | null;
}): number {
  const quantity = subscription.items?.data?.[0]?.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) return 1;
  if (quantity < 1) return 1;
  return Math.min(quantity, MAX_PURCHASABLE_SEATS);
}

export function resolveCheckoutSessionSeats(session: {
  line_items?: { data?: Array<{ quantity?: number | null }> } | null;
}): number | null {
  const quantity = session.line_items?.data?.[0]?.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) return null;
  return Math.min(quantity, MAX_PURCHASABLE_SEATS);
}

export interface PurchasedSeatRecord {
  planTier: string;
  seats: number;
  perSeat: boolean;
}

function isEnterprisePlanTier(planTier: string): boolean {
  return planTier.toLowerCase() === ENTERPRISE_PLAN_TIER;
}

export function buildPurchasedSeatRecord(
  planTier: string,
  subscription: Stripe.Subscription | { items?: { data?: Array<{ quantity?: number | null }> } },
): PurchasedSeatRecord {
  const perSeat = isPerSeatBillingPlan(planTier) || isEnterprisePlanTier(planTier);
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
  | 'subscription_mismatch'
  | 'seat_expansion_blocked';

function toLicensedSeatsNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function guardEnterpriseSeatExpansion(
  db: DatabaseAdapter,
  ownerUserId: string,
  requestedSeats: number,
): Promise<{ blocked: boolean }> {
  const [organization] = await db.query<{ id: string; licensed_seats: number }>(
    `select id, licensed_seats from public.organizations where owner_user_id = $1 limit 1`,
    [ownerUserId],
  );
  if (!organization) return { blocked: false };
  if (requestedSeats <= toLicensedSeatsNumber(organization.licensed_seats))
    return { blocked: false };

  const collectionState = await readOrganizationCollectionState(db, organization.id);
  if (!collectionState.seatExpansionBlocked) return { blocked: false };

  logger.warn(
    {
      organizationId: organization.id,
      ownerUserId,
      requestedSeats,
      licensedSeats: organization.licensed_seats,
      stage: collectionState.stage,
    },
    'Refusing enterprise seat expansion while billing collection blocks new commitments',
  );
  await recordAuditEvent({
    organizationId: organization.id,
    eventType: 'plan_changed',
    severity: 'warning',
    surface: 'stripe_webhook',
    detail: {
      resourceType: 'organization',
      resourceId: organization.id,
      reason: SEAT_EXPANSION_BLOCKED_AUDIT_REASON,
      status: collectionState.stage,
    },
  });
  return { blocked: true };
}

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
  if (isEnterprisePlanTier(input.planTier)) {
    const guard = await guardEnterpriseSeatExpansion(db, input.ownerUserId, input.seats);
    if (guard.blocked) return 'seat_expansion_blocked';
  }

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

export type SubscriptionSeatReader = Pick<Stripe, 'subscriptions'>;

export interface OwnerPurchasedSeats {
  seats: number;
  planTier: string;
}

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
  const planTier = row.plan_tier ?? '';

  if (isEnterprisePlanTier(planTier)) {
    const [organization] = await db.query<{ id: string }>(
      `select id from public.organizations where owner_user_id = $1 limit 1`,
      [ownerUserId],
    );
    const collectionReadOnly = organization
      ? (await readOrganizationCollectionState(db, organization.id)).readOnly
      : false;
    if (!isEntitledSubscriptionStatusForTier(planTier, row.status, collectionReadOnly)) return null;
  } else {
    if (!isEntitledSubscriptionStatus(row.status)) return null;
    if (!isPerSeatBillingPlan(planTier)) return null;
  }

  const subscription = await getStripe().subscriptions.retrieve(row.stripe_subscription_id);
  const purchased = buildPurchasedSeatRecord(planTier, subscription);

  return { seats: purchased.seats, planTier };
}
