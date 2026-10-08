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
  premium_paid_through_active: boolean | null;
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

  let ownerUserId: string | null = null;
  let stripeIds: { subscriptionId: string; customerId: string | null } | null = null;

  const change = await withSeatAccountingErrors(() =>
    db.transaction(async (tx): Promise<SeatTypeChange> => {
      await lockMembership(tx, input.organizationId);
      await resolveAuthority(tx, input.organizationId, input.administrator);

      const [member] = await tx.query<MemberSeatRow>(
        `select user_id, seat_type,
                (premium_paid_through is not null and premium_paid_through > now())
                  as premium_paid_through_active
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
            where organization_id = $1 and seat_type = 'premium'`,
          [input.organizationId],
        );
        const assignedPremium = Number.parseInt(assigned?.assigned ?? '0', 10);
        const paidSeatFree = seats.premium > assignedPremium;
        const restored = member.premium_paid_through_active === true;
        if (!paidSeatFree && seats.standard < 1) {
          throw createError.conflict(NO_PAID_PREMIUM_SEAT_MESSAGE);
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
      const nextSeats = paidSeat
        ? await billing.moveSeat({
            seats: { standard: seats.standard + 1, premium: seats.premium - 1 },
            charge: false,
            idempotencyKey: input.idempotencyKey ?? null,
          })
        : seats;

      await tx.execute(
        `update public.organization_members
            set seat_type = 'standard', premium_paid_through = $3::timestamptz
          where organization_id = $1 and user_id = $2`,
        [input.organizationId, input.targetUserId, paidThrough],
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

/**
 * The cadence and currency a workspace's seats are billed in, read from the
 * price recorded on the owner's subscription. Null when the workspace is not on
 * a Team subscription this deployment has a price for.
 */
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
  if (!billing) return null;
  return {
    licensedPremiumSeats: Number(row.licensed_premium_seats ?? 0),
    premiumSeatsAssigned: Number(row.premium_seats_assigned ?? 0),
    billing,
  };
}
