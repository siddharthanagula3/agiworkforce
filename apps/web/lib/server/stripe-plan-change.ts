import 'server-only';

import { isPerSeatBillingPlan } from '@agiworkforce/types';
import type Stripe from 'stripe';

export type CheckoutBillingInterval = 'monthly' | 'yearly';

/**
 * Resolve the only Stripe billing periods supported by the self-serve upgrade
 * flow. Multi-month/year prices are intentionally excluded: changing billing
 * periods resets Stripe's renewal anchor and is not a remaining-period upgrade.
 */
export function checkoutBillingIntervalFromStripePrice(
  recurring: Stripe.Price.Recurring | null | undefined,
): CheckoutBillingInterval | null {
  if (!recurring || recurring.interval_count !== 1) return null;
  if (recurring.interval === 'month') return 'monthly';
  if (recurring.interval === 'year') return 'yearly';
  return null;
}

export function assertSameCheckoutBillingInterval(
  recurring: Stripe.Price.Recurring | null | undefined,
  requestedInterval: CheckoutBillingInterval,
): void {
  const currentInterval = checkoutBillingIntervalFromStripePrice(recurring);
  if (!currentInterval) {
    throw new Error('The current Stripe billing interval could not be verified');
  }
  if (currentInterval !== requestedInterval) {
    throw new Error(
      `Mid-cycle upgrades must keep your current ${currentInterval} billing cadence so you are charged only the prorated difference for the remaining period. Select ${currentInterval} or change cadence in billing management.`,
    );
  }
}

/**
 * Rank used by BOTH `/api/upgrade/preview` and `/api/upgrade` so a change the
 * preview priced can never be refused (or vice versa) by the apply step.
 *
 * Team sits between Pro and Max here because that is where its capability set
 * lands, but note that a Team change is normally a SEAT change, not a rank
 * change — see `classifyPlanChange`.
 */
export const TIER_ORDER: Readonly<Record<string, number>> = Object.freeze({
  free: 0,
  basic: 0.5,
  pro: 1,
  team: 1.5,
  max: 2,
  max_15x: 3,
  enterprise: 4,
});

export function isUpgrade(from: string, to: string): boolean {
  return (TIER_ORDER[to] ?? -1) > (TIER_ORDER[from] ?? -1);
}

export type PlanChangeKind = 'tier_upgrade' | 'seat_increase';

export type PlanChangeDecision =
  | { allowed: true; kind: PlanChangeKind }
  | { allowed: false; reason: string };

/**
 * Decide whether a mid-cycle subscription change may proceed.
 *
 * Two shapes are allowed:
 *  - `tier_upgrade`: a strictly higher tier. Existing behaviour.
 *  - `seat_increase`: same per-seat tier, strictly more seats. This is the
 *    "add seats to my Team" path; a plain tier comparison calls it
 *    "team -> team" and refuses it, which is why it is classified separately.
 *
 * Seat REDUCTION is deliberately refused here rather than silently accepted.
 * The mid-cycle path runs `proration_behavior: 'always_invoice'`, so a
 * reduction would immediately issue a credit/refund — a money-out flow with no
 * scoped policy — and it would also let an org drop below the seats its members
 * already occupy. It is routed to billing management instead.
 */
export function classifyPlanChange(input: {
  currentTier: string;
  targetPlan: string;
  requestedSeats: number;
  currentSeats: number;
}): PlanChangeDecision {
  const { currentTier, targetPlan, requestedSeats, currentSeats } = input;

  if (currentTier === targetPlan) {
    if (!isPerSeatBillingPlan(targetPlan)) {
      return {
        allowed: false,
        reason: `Cannot upgrade from ${currentTier} to ${targetPlan}. Use the billing portal to change or downgrade your plan.`,
      };
    }
    if (requestedSeats > currentSeats) return { allowed: true, kind: 'seat_increase' };
    if (requestedSeats === currentSeats) {
      return {
        allowed: false,
        reason: `Your subscription already has ${currentSeats} ${currentSeats === 1 ? 'seat' : 'seats'}.`,
      };
    }
    return {
      allowed: false,
      reason:
        'Reducing seats is handled in billing management so the credit and the removal of members stay in step.',
    };
  }

  // A per-seat ORGANIZATION plan may not be crossed into or out of on the
  // individual upgrade path, in EITHER direction.
  //
  // Leaving it: TIER_ORDER ranks team at 1.5, so isUpgrade('team','max') is true
  // and a Team owner could convert the organization's per-seat subscription into
  // a personal Max plan — collapsing the seat quantity, silently stranding every
  // other member of the org, and leaving `organizations.licensed_seats` pointing
  // at a subscription that no longer sells seats.
  //
  // Entering it: isUpgrade('pro','team') is likewise true, which would mint a
  // Team subscription with NO organization behind it and no seat count — a plan
  // whose entire value proposition is seats, sold to a single user with none.
  //
  // Both are seat/organization lifecycle changes, not rank changes, so they
  // belong to organization billing where the org and its members are in scope.
  if (isPerSeatBillingPlan(currentTier)) {
    return {
      allowed: false,
      reason:
        'Changing an organization plan is handled in billing management so seats and member access stay in step.',
    };
  }
  if (isPerSeatBillingPlan(targetPlan)) {
    return {
      allowed: false,
      reason:
        'Moving to an organization plan is handled in billing management so the organization and its seats are created together.',
    };
  }

  if (!isUpgrade(currentTier, targetPlan)) {
    return {
      allowed: false,
      reason: `Cannot upgrade from ${currentTier} to ${targetPlan}. Use the billing portal to change or downgrade your plan.`,
    };
  }

  return { allowed: true, kind: 'tier_upgrade' };
}

/** Seat count currently billed on a Stripe subscription item (absent means 1). */
export function currentSeatsFromStripeItem(quantity: number | null | undefined): number {
  return typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 1 ? quantity : 1;
}
