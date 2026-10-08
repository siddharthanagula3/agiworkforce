import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_TEAM_SEAT_TYPE,
  normalizeBillingPlanTier,
  normalizeTeamSeatType,
  teamSeatPlanTier,
  teamSeatTypeOfPlan,
  totalTeamSeats,
  type TeamSeatBilling,
  type TeamSeatType,
  type TeamSeatTypeChange,
  type TeamSeatTypeSummary,
} from '@agiworkforce/types';
import { persistPurchasedSeatsOnOrganization } from '@/app/api/stripe-webhook/lib/seats';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  hasBillingWaitlistAccess,
  holdsLivePaidSubscription,
  waitlistAccessRequiredResponse,
} from '@/lib/server/billing-waitlist-access';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import {
  DEFAULT_CHECKOUT_CURRENCY,
  getConfiguredPriceId,
  getPricePointForPriceId,
} from '@/lib/pricing';
import {
  SeatTypePaymentPendingError,
  openTeamSeatBilling,
  type TeamSeatStripe,
} from '@/lib/server/stripe-plan-change';
import {
  lockMembership,
  resolveAuthority,
  type MemberAdministrator,
} from '@/lib/services/organization-member-admin-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { withSeatAccountingErrors } from '@/lib/services/organization-seat-service';
import { SubscriptionService, type SubscriptionInfo } from '@/lib/services/subscription-service';

export { SeatTypePaymentPendingError };

export interface SeatTypeChange extends TeamSeatTypeChange {
  previousSeatType: TeamSeatType;
}

export { waitlistAccessRequiredResponse as seatTypeWaitlistResponse };

export class SeatTypeWaitlistError extends Error {
  constructor() {
    super('Paid seat changes are not open to this workspace yet');
    this.name = 'SeatTypeWaitlistError';
  }
}

export const SEAT_BILLING_PERMISSION = 'billing.contracts.manage';

const SEAT_BILLING_DENIED_MESSAGE =
  'Only the workspace owner can change what the workspace pays. An admin can assign a Premium seat that is already paid for and not in use. Nothing was changed.';

export const PREMIUM_SEAT_CEILING_CONSTRAINT = 'organization_members_premium_within_license';

const NO_PAID_PREMIUM_SEAT_MESSAGE =
  'Every paid Premium seat is already assigned. Nothing was changed and nothing was charged.';

interface OrganizationBillingRow {
  owner_user_id: string | null;
  billing_plan_tier: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

interface MemberSeatRow {
  user_id: string;
  seat_type: string | null;
  premium_paid_through: string | Date | null;
}

async function ownSubscriptionOf(
  privileged: DatabaseAdapter,
  ownerUserId: string,
): Promise<SubscriptionInfo | null> {
  return (await resolveEntitlementBundle(privileged, ownerUserId, { includeSeats: false }))
    .subscription;
}

function isPremiumCeilingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record['constraint'] === PREMIUM_SEAT_CEILING_CONSTRAINT) return true;
  const text = error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : '';
  return text.includes('no paid Premium seat left');
}

async function readOrganizationBilling(
  privileged: DatabaseAdapter,
  organizationId: string,
): Promise<OrganizationBillingRow> {
  const [row] = await privileged.query<OrganizationBillingRow>(
    `select owner_user_id, billing_plan_tier, stripe_subscription_id, stripe_customer_id
       from public.organizations
      where id = $1
      limit 1`,
    [organizationId],
  );
  if (!row) throw createError.notFound('Organization not found');
  if (
    teamSeatTypeOfPlan(normalizeBillingPlanTier(row.billing_plan_tier)) !==
      DEFAULT_TEAM_SEAT_TYPE ||
    !row.stripe_subscription_id ||
    !row.owner_user_id
  ) {
    throw createError.conflict(
      'Seat types are part of a Team plan billed on the web. This workspace has no Team subscription to change.',
    );
  }
  return row;
}

async function raisePremiumAllowance(
  privileged: DatabaseAdapter,
  ownerUserId: string,
  memberUserId: string,
): Promise<void> {
  try {
    const owned = await ownSubscriptionOf(privileged, ownerUserId);
    if (!owned) return;
    const catalogVersion = owned.plan_catalog_version ?? null;
    await SubscriptionService.carryCreditsForUpgradePeriod(
      memberUserId,
      owned.id,
      teamSeatPlanTier('standard'),
      teamSeatPlanTier('premium'),
      owned.current_period_start,
      owned.current_period_end,
      privileged,
      { previous: catalogVersion, next: catalogVersion },
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('No credit account found')) return;
    logger.error(
      { error, memberUserId },
      'The usage ledger of a new Premium seat was not raised to the Premium allowance for this period',
    );
  }
}

function paidThroughStillCovers(
  paidThrough: string | Date | null,
  periodEnd: string | null,
): boolean {
  if (!paidThrough || !periodEnd) return false;
  const until = new Date(paidThrough).getTime();
  return until > Date.now() && until <= new Date(periodEnd).getTime();
}

async function requireSeatBillingAuthority(organizationId: string, actorId: string) {
  await requireMemberPermission(
    organizationId,
    actorId,
    SEAT_BILLING_PERMISSION,
    SEAT_BILLING_DENIED_MESSAGE,
  );
}

async function requirePaidChangesOpen(
  privileged: DatabaseAdapter,
  payer: DatabaseAdapter,
  ownerUserId: string,
): Promise<void> {
  if (holdsLivePaidSubscription(await ownSubscriptionOf(privileged, ownerUserId))) return;
  if (await hasBillingWaitlistAccess(payer, ownerUserId)) return;
  throw new SeatTypeWaitlistError();
}

async function recordPaidThrough(
  privileged: DatabaseAdapter,
  input: { organizationId: string; userId: string; paidThrough: string },
): Promise<void> {
  try {
    await privileged.execute(
      `update public.organization_members
          set premium_paid_through = $3::timestamptz
        where organization_id = $1 and user_id = $2 and seat_type = 'standard'`,
      [input.organizationId, input.userId, input.paidThrough],
    );
  } catch (error) {
    logger.error(
      { error, organizationId: input.organizationId, userId: input.userId },
      'The paid Premium period of a seat moved to Standard was not recorded; the member is on Standard limits now',
    );
  }
}

export interface ChangeMemberSeatTypeInput {
  organizationId: string;
  administrator: MemberAdministrator;
  targetUserId: string;
  seatType: TeamSeatType;
  idempotencyKey?: string | null;
}

export interface SeatTypeDependencies {
  privileged: DatabaseAdapter;
  stripe: TeamSeatStripe;
}

export async function changeMemberSeatType(
  db: DatabaseAdapter,
  dependencies: SeatTypeDependencies,
  input: ChangeMemberSeatTypeInput,
): Promise<SeatTypeChange> {
  const { privileged, stripe } = dependencies;
  if (input.administrator.kind !== 'member') {
    throw createError
      .forbidden(
        'A workspace API key cannot change seat types, because a seat type changes what the workspace pays. Change it in the workspace console.',
      )
      .asUserSafe();
  }

  const actorId = input.administrator.userId;
  let ownerUserId: string | null = null;
  let stripeIds: { subscriptionId: string; customerId: string | null } | null = null;

  const change = await withSeatAccountingErrors(() =>
    db.transaction(async (tx): Promise<SeatTypeChange> => {
      await lockMembership(tx, input.organizationId);
      await resolveAuthority(tx, input.organizationId, input.administrator);

      const [member] = await tx.query<MemberSeatRow>(
        `select user_id, seat_type, premium_paid_through
           from public.organization_members
          where organization_id = $1 and user_id = $2 and status = 'active'
          limit 1`,
        [input.organizationId, input.targetUserId],
      );
      if (!member) throw createError.notFound('Member not found in this organization');

      const organization = await readOrganizationBilling(privileged, input.organizationId);
      ownerUserId = organization.owner_user_id;
      const subscriptionId = organization.stripe_subscription_id as string;
      stripeIds = { subscriptionId, customerId: organization.stripe_customer_id };

      const billing = await openTeamSeatBilling(stripe, subscriptionId);
      const seats = billing.seats;
      const previousSeatType = normalizeTeamSeatType(member.seat_type);

      if (previousSeatType === input.seatType) {
        return {
          seatType: input.seatType,
          previousSeatType,
          billing: 'none',
          premiumPaidThrough: null,
          seats,
        };
      }

      billing.assertChangeable();

      if (input.seatType === 'premium') {
        const [assigned] = await tx.query<{ assigned: string }>(
          `select count(*)::text as assigned
             from public.organization_members
            where organization_id = $1 and seat_type = 'premium' and status = 'active'`,
          [input.organizationId],
        );
        const assignedPremium = Number.parseInt(assigned?.assigned ?? '0', 10);
        const paidSeatFree = seats.premium > assignedPremium;
        const restored = paidThroughStillCovers(member.premium_paid_through, billing.paidThrough);
        if (!paidSeatFree && seats.standard < 1) {
          throw createError.conflict(NO_PAID_PREMIUM_SEAT_MESSAGE);
        }
        if (!paidSeatFree) {
          await requireSeatBillingAuthority(input.organizationId, actorId);
          if (!restored)
            await requirePaidChangesOpen(privileged, tx, organization.owner_user_id as string);
        }
        const nextSeats = paidSeatFree
          ? seats
          : await billing.moveSeat({
              seats: { standard: seats.standard - 1, premium: seats.premium + 1 },
              charge: !restored,
              idempotencyKey: input.idempotencyKey ?? null,
            });

        await persistPurchasedSeatsOnOrganization(privileged, {
          ownerUserId: organization.owner_user_id as string,
          seats: totalTeamSeats(nextSeats),
          premiumSeats: nextSeats.premium,
          planTier: teamSeatPlanTier('standard'),
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: organization.stripe_customer_id,
        });

        try {
          await tx.execute(
            `update public.organization_members
                set seat_type = 'premium', premium_paid_through = null
              where organization_id = $1 and user_id = $2`,
            [input.organizationId, input.targetUserId],
          );
        } catch (error) {
          if (isPremiumCeilingError(error)) {
            throw createError.conflict(NO_PAID_PREMIUM_SEAT_MESSAGE);
          }
          throw error;
        }

        return {
          seatType: 'premium',
          previousSeatType,
          billing: paidSeatFree
            ? 'uses_paid_seat'
            : restored
              ? 'restored_paid_seat'
              : 'charged_now',
          premiumPaidThrough: null,
          seats: nextSeats,
        };
      }

      if (!billing.paidThrough) {
        throw createError.conflict(
          'The billing period of this subscription could not be read. Nothing was changed.',
        );
      }
      const paidSeat = seats.premium >= 1;
      const paidThrough = paidSeat ? billing.paidThrough : null;
      if (paidSeat) await requireSeatBillingAuthority(input.organizationId, actorId);
      const nextSeats = paidSeat
        ? await billing.moveSeat({
            seats: { standard: seats.standard + 1, premium: seats.premium - 1 },
            charge: false,
            idempotencyKey: input.idempotencyKey ?? null,
          })
        : seats;

      await tx.execute(
        `update public.organization_members
            set seat_type = 'standard'
          where organization_id = $1 and user_id = $2`,
        [input.organizationId, input.targetUserId],
      );

      return {
        seatType: 'standard',
        previousSeatType,
        billing: paidSeat ? 'reduced_at_renewal' : 'none',
        premiumPaidThrough: paidThrough,
        seats: nextSeats,
      };
    }),
  );

  if (change.premiumPaidThrough) {
    await recordPaidThrough(privileged, {
      organizationId: input.organizationId,
      userId: input.targetUserId,
      paidThrough: change.premiumPaidThrough,
    });
  }

  if (change.billing === 'reduced_at_renewal' && ownerUserId && stripeIds) {
    const ids: { subscriptionId: string; customerId: string | null } = stripeIds;
    await persistPurchasedSeatsOnOrganization(privileged, {
      ownerUserId,
      seats: totalTeamSeats(change.seats),
      premiumSeats: change.seats.premium,
      planTier: teamSeatPlanTier('standard'),
      stripeSubscriptionId: ids.subscriptionId,
      stripeCustomerId: ids.customerId,
    }).catch((error: unknown) => {
      logger.error(
        { error, organizationId: input.organizationId },
        'Seat counts were not stored after a seat returned to Standard; the subscription webhook stores them',
      );
    });
  }

  if ((change.billing === 'charged_now' || change.billing === 'uses_paid_seat') && ownerUserId) {
    await raisePremiumAllowance(privileged, ownerUserId, input.targetUserId);
  }

  return change;
}

async function readSeatBilling(
  privileged: DatabaseAdapter,
  ownerUserId: string | null,
): Promise<TeamSeatBilling | null> {
  if (!ownerUserId) return null;
  const owned = await ownSubscriptionOf(privileged, ownerUserId);
  const point = owned?.stripe_price_id ? getPricePointForPriceId(owned.stripe_price_id) : null;
  if (!point || teamSeatTypeOfPlan(point.plan) === null) return null;
  return {
    interval: point.interval,
    currency: point.currency,
    premiumSeatsSold:
      point.currency === DEFAULT_CHECKOUT_CURRENCY &&
      getConfiguredPriceId(teamSeatPlanTier('premium'), point.interval, point.currency) !==
        undefined,
  };
}

export async function readSeatTypeSummary(
  privileged: DatabaseAdapter,
  organizationId: string,
): Promise<TeamSeatTypeSummary | null> {
  const [row] = await privileged.query<{
    owner_user_id: string | null;
    billing_plan_tier: string | null;
    licensed_premium_seats: number | string | null;
    premium_seats_assigned: number | string | null;
  }>(
    `select organization.owner_user_id, organization.billing_plan_tier,
            organization.licensed_premium_seats,
            (
              select count(*)
                from public.organization_members member
               where member.organization_id = organization.id
                 and member.seat_type = 'premium'
                 and member.status = 'active'
            ) as premium_seats_assigned
       from public.organizations organization
      where organization.id = $1
      limit 1`,
    [organizationId],
  );
  if (
    !row ||
    teamSeatTypeOfPlan(normalizeBillingPlanTier(row.billing_plan_tier)) !== DEFAULT_TEAM_SEAT_TYPE
  ) {
    return null;
  }
  const billing = await readSeatBilling(privileged, row.owner_user_id);
  const licensedPremiumSeats = Number(row.licensed_premium_seats ?? 0);
  if (!billing || (!billing.premiumSeatsSold && licensedPremiumSeats === 0)) return null;
  return {
    licensedPremiumSeats,
    premiumSeatsAssigned: Number(row.premium_seats_assigned ?? 0),
    billing,
  };
}
