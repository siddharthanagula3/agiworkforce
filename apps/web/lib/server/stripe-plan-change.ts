import 'server-only';

import { isPerSeatBillingPlan } from '@agiworkforce/types';
import type Stripe from 'stripe';

export type CheckoutBillingInterval = 'monthly' | 'yearly';

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

export function currentSeatsFromStripeItem(quantity: number | null | undefined): number {
  return typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 1 ? quantity : 1;
}
