import 'server-only';

import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  TEAM_SEAT_TYPE_LABELS,
  getBillingPlanPricing,
  isEntitledSubscriptionStatus,
  isPerSeatBillingPlan,
  isSelfServeIndividualPlanTier,
  normalizeBillingPlanTier,
  planOffersBillingInterval,
  teamSeatPlanTier,
  totalTeamSeats,
  type BillingInterval,
  type BillingPlanTier,
  type SelfServeIndividualPlanTier,
  type TeamSeatQuantities,
  type TeamSeatType,
} from '@agiworkforce/types';
import type Stripe from 'stripe';
import type {
  DowngradeBlock,
  DowngradeTarget,
  PlanChangeState,
  RecurringPrice,
  ScheduledPlanChange,
} from '@/features/billing/lib/billing-account-types';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  primarySeatLineItem,
  resolveSeatQuantities,
  seatLineItemOfType,
  seatTypeOfLineItem,
} from '@/lib/billing/team-seat-items';
import { resolvePlanTier } from '@/lib/price-tier-mapping';
import { getPriceSelectionForCurrency } from '@/lib/server/localized-pricing-service';
import type { ManagedStripeSubscription } from '@/lib/server/stripe-upgrade-subscription';
import { getSubscriptionPeriod } from '@/lib/stripe-types';

export type CheckoutBillingInterval = 'monthly' | 'yearly';

export function checkoutBillingIntervalFromStripePrice(
  recurring: Stripe.Price.Recurring | null | undefined,
): CheckoutBillingInterval | null {
  if (!recurring || recurring.interval_count !== 1) return null;
  if (recurring.interval === 'month') return 'monthly';
  if (recurring.interval === 'year') return 'yearly';
  return null;
}

export function assertUpgradeBillingInterval(
  recurring: Stripe.Price.Recurring | null | undefined,
  requestedInterval: CheckoutBillingInterval,
  targetPlan: string,
): void {
  const currentInterval = checkoutBillingIntervalFromStripePrice(recurring);
  if (!currentInterval) {
    throw new Error('The current Stripe billing interval could not be verified');
  }
  if (currentInterval === requestedInterval) return;
  if (!planOffersBillingInterval(targetPlan, currentInterval)) return;
  throw new Error(
    `Mid-cycle upgrades keep your current ${currentInterval} billing cadence. Select ${currentInterval} billing to upgrade now.`,
  );
}

function sellsCadence(plan: BillingPlanTier, price: RecurringPrice): boolean {
  return planOffersBillingInterval(plan, price.interval);
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

export type PlanChangeAnchor = 'now' | 'unchanged';

export function planChangeAnchor(kind: PlanChangeKind): PlanChangeAnchor {
  return kind === 'seat_increase' ? 'unchanged' : 'now';
}

/**
 * The preview and the charge must use the same anchor or the number quoted and
 * the number charged come from different rules. A tier upgrade restarts the
 * cycle, and Stripe rejects `proration_date` alongside that reset. A seat
 * increase keeps the renewal date, so the added seats co-term with the seats
 * already held, and `proration_date` pins the charge to the quoted instant.
 */
export function planChangeProration(
  anchor: PlanChangeAnchor,
  prorationDate: number,
):
  | { proration_behavior: 'always_invoice'; billing_cycle_anchor: 'now' }
  | {
      proration_behavior: 'always_invoice';
      billing_cycle_anchor: 'unchanged';
      proration_date: number;
    } {
  return anchor === 'unchanged'
    ? {
        proration_behavior: 'always_invoice',
        billing_cycle_anchor: 'unchanged',
        proration_date: prorationDate,
      }
    : { proration_behavior: 'always_invoice', billing_cycle_anchor: 'now' };
}

export type PlanChangeDecision =
  { allowed: true; kind: PlanChangeKind } | { allowed: false; reason: string };

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

export interface SeatChangeBasis {
  item: Stripe.SubscriptionItem;
  currentSeats: number;
  premiumSeats: number;
  premiumRecurringCents: number;
}

/**
 * A Team subscription may carry a Premium seat line beside its Standard one. A
 * seat count is the sum of both, and a seat added here is a Standard seat, so
 * the Premium line is left exactly as Stripe holds it.
 */
export function seatChangeBasis(subscription: Stripe.Subscription): SeatChangeBasis | null {
  const item = primarySeatLineItem(subscription.items.data);
  if (!item) return null;
  const seatTypes = resolveSeatQuantities(subscription.items.data);
  const premiumLine = seatLineItemOfType(subscription.items.data, 'premium');
  const premiumSeats = seatTypes?.premium ?? 0;
  return {
    item,
    currentSeats: seatTypes
      ? Math.max(totalTeamSeats(seatTypes), 1)
      : currentSeatsFromStripeItem(item.quantity),
    premiumSeats,
    premiumRecurringCents: (premiumLine?.price.unit_amount ?? 0) * premiumSeats,
  };
}

export function planChangeItems(
  basis: SeatChangeBasis,
  priceId: string,
  requestedSeats: number,
): Array<{ id?: string; price: string; quantity: number }> {
  const quantity = requestedSeats - basis.premiumSeats;
  return seatTypeOfLineItem(basis.item) === 'premium'
    ? [{ price: priceId, quantity }]
    : [{ id: basis.item.id, price: priceId, quantity }];
}

export function planChangeApplied(
  subscription: Stripe.Subscription,
  priceId: string,
  requestedSeats: number,
): boolean {
  const applied = seatChangeBasis(subscription);
  return (
    applied !== null &&
    subscription.items.data.some((line) => line.price.id === priceId) &&
    applied.currentSeats === requestedSeats
  );
}

const STRIPE_INTERVAL: Readonly<Record<BillingInterval, 'month' | 'year'>> = {
  monthly: 'month',
  yearly: 'year',
};

const DOWNGRADE_BLOCK_MESSAGE: Readonly<Record<DowngradeBlock, string>> = {
  pending_cancellation:
    'This plan is set to end, so it cannot switch plans. Resume it first, then choose a smaller plan.',
  organization_plan:
    'Organization plans change in Manage billing, so seats and member access stay in step.',
  lowest_plan: 'This is already the smallest paid plan. Cancel the plan to stop paying for it.',
};

interface ResolvedTargetPrice {
  priceId: string;
  price: RecurringPrice;
}

function isoFromSeconds(seconds: number | null | undefined): string | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function isLivePrice(price: string | Stripe.Price | Stripe.DeletedPrice): price is Stripe.Price {
  return typeof price !== 'string' && price.deleted !== true;
}

function recurringPriceOf(
  price: Stripe.Price | null | undefined,
  quantity: number,
): RecurringPrice | null {
  if (!price || typeof price.unit_amount !== 'number') return null;
  const interval = checkoutBillingIntervalFromStripePrice(price.recurring);
  return interval
    ? { amountCents: price.unit_amount * quantity, currency: price.currency, interval }
    : null;
}

function currentItemOf(subscription: Stripe.Subscription): Stripe.SubscriptionItem | null {
  return primarySeatLineItem(subscription.items.data);
}

function currentPriceOf(subscription: Stripe.Subscription): RecurringPrice | null {
  const item = currentItemOf(subscription);
  const price = recurringPriceOf(item?.price, item?.quantity ?? 1);
  if (!price || !resolveSeatQuantities(subscription.items.data)) return price;
  const amountCents = subscription.items.data.reduce(
    (total, line) =>
      seatTypeOfLineItem(line) === null
        ? total
        : total + (line.price.unit_amount ?? 0) * (line.quantity ?? 0),
    0,
  );
  return { ...price, amountCents };
}

function cancelAtOf(subscription: Stripe.Subscription): string | null {
  return (
    isoFromSeconds(subscription.cancel_at) ??
    (subscription.cancel_at_period_end
      ? isoFromSeconds(currentItemOf(subscription)?.current_period_end)
      : null)
  );
}

export function currentPlanOf(managed: ManagedStripeSubscription): BillingPlanTier {
  const priceId = currentItemOf(managed.subscription)?.price.id;
  return normalizeBillingPlanTier(
    resolvePlanTier(managed.subscription.metadata, priceId) ?? managed.row.plan_tier,
  );
}

function downgradeBlockOf(plan: BillingPlanTier, cancelAt: string | null): DowngradeBlock | null {
  if (!isSelfServeIndividualPlanTier(plan)) return 'organization_plan';
  if (cancelAt) return 'pending_cancellation';
  return SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.indexOf(plan) === 0 ? 'lowest_plan' : null;
}

function lowerPlansThan(plan: SelfServeIndividualPlanTier): SelfServeIndividualPlanTier[] {
  return SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.slice(
    0,
    SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.indexOf(plan),
  ).reverse();
}

async function resolveTargetPrice(
  plan: SelfServeIndividualPlanTier,
  current: RecurringPrice,
): Promise<ResolvedTargetPrice | null> {
  const intervals: BillingInterval[] =
    current.interval === 'yearly' && planOffersBillingInterval(plan, 'yearly')
      ? ['yearly', 'monthly']
      : ['monthly'];
  for (const interval of intervals) {
    const selection = await getPriceSelectionForCurrency(plan, interval, current.currency);
    if (selection && selection.currency.toLowerCase() === current.currency.toLowerCase()) {
      return {
        priceId: selection.priceId,
        price: { amountCents: selection.amountMinor, currency: selection.currency, interval },
      };
    }
  }
  return null;
}

async function cadenceSwitchOf(
  plan: BillingPlanTier,
  current: RecurringPrice | null,
  cancelAt: string | null,
): Promise<DowngradeTarget | null> {
  if (!current || cancelAt || !isSelfServeIndividualPlanTier(plan) || sellsCadence(plan, current)) {
    return null;
  }
  const targetPrice = await resolveTargetPrice(plan, current);
  return targetPrice ? { plan, price: targetPrice.price } : null;
}

async function downgradeTargetsOf(
  plan: SelfServeIndividualPlanTier,
  current: RecurringPrice,
): Promise<DowngradeTarget[]> {
  const resolved = await Promise.all(
    lowerPlansThan(plan).map(async (target) => {
      const targetPrice = await resolveTargetPrice(target, current);
      return targetPrice ? { plan: target, price: targetPrice.price } : null;
    }),
  );
  return resolved.filter((target): target is DowngradeTarget => target !== null);
}

function isLiveSchedule(schedule: Stripe.SubscriptionSchedule): boolean {
  return schedule.status === 'active' || schedule.status === 'not_started';
}

function currentPhaseOf(
  schedule: Stripe.SubscriptionSchedule,
): Stripe.SubscriptionSchedule.Phase | null {
  const current = schedule.current_phase;
  if (!current) return null;
  return schedule.phases.find((phase) => phase.start_date === current.start_date) ?? null;
}

function upcomingPhaseOf(
  schedule: Stripe.SubscriptionSchedule,
): Stripe.SubscriptionSchedule.Phase | null {
  const current = schedule.current_phase;
  if (!isLiveSchedule(schedule) || !current) return null;
  return schedule.phases.find((phase) => phase.start_date >= current.end_date) ?? null;
}

async function readScheduledChange(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  plan: BillingPlanTier,
  current: RecurringPrice | null,
): Promise<ScheduledPlanChange | null> {
  const scheduleId = idOf(subscription.schedule);
  if (!scheduleId) return null;
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId, {
    expand: ['phases.items.price'],
  });
  const phase = upcomingPhaseOf(schedule);
  const item = phase?.items[0];
  if (!phase || !item) return null;
  const nextTier = resolvePlanTier(phase.metadata, idOf(item.price));
  if (!nextTier) return null;
  const nextPlan = normalizeBillingPlanTier(nextTier);
  const price = isLivePrice(item.price) ? recurringPriceOf(item.price, item.quantity ?? 1) : null;
  if (nextPlan === plan && (!price || price.interval === current?.interval)) return null;
  return {
    plan: nextPlan,
    effectiveAt: new Date(phase.start_date * 1000).toISOString(),
    price,
  };
}

export async function readPlanChangeState(
  stripe: Stripe,
  managed: ManagedStripeSubscription,
): Promise<PlanChangeState> {
  const { subscription } = managed;
  const plan = currentPlanOf(managed);
  const price = currentPriceOf(subscription);
  const cancelAt = cancelAtOf(subscription);
  const downgradeBlock = downgradeBlockOf(plan, cancelAt);
  const [scheduledChange, downgradeTargets, cadenceSwitch] = await Promise.all([
    readScheduledChange(stripe, subscription, plan, price),
    !downgradeBlock && price && isSelfServeIndividualPlanTier(plan)
      ? downgradeTargetsOf(plan, price)
      : Promise.resolve([]),
    cadenceSwitchOf(plan, price, cancelAt),
  ]);

  return {
    plan,
    status: subscription.status,
    price,
    periodEnd: isoFromSeconds(currentItemOf(subscription)?.current_period_end),
    trialStart: isoFromSeconds(subscription.trial_start),
    trialEnd: isoFromSeconds(subscription.trial_end),
    cancelAt,
    scheduledChange,
    downgradeTargets,
    downgradeBlock,
    cadenceSwitch,
  };
}

function phaseItemsOf(
  phase: Stripe.SubscriptionSchedule.Phase,
): Stripe.SubscriptionScheduleUpdateParams.Phase.Item[] {
  return phase.items.map((item) => ({
    price: typeof item.price === 'string' ? item.price : item.price.id,
    quantity: item.quantity ?? 1,
  }));
}

function phaseDiscountsOf(
  phase: Stripe.SubscriptionSchedule.Phase,
): Stripe.SubscriptionScheduleUpdateParams.Phase.Discount[] {
  return phase.discounts.flatMap<Stripe.SubscriptionScheduleUpdateParams.Phase.Discount>(
    (entry) => {
      const discount = idOf(entry.discount);
      if (discount) return [{ discount }];
      const coupon = idOf(entry.coupon);
      if (coupon) return [{ coupon }];
      const promotionCode = idOf(entry.promotion_code);
      return promotionCode ? [{ promotion_code: promotionCode }] : [];
    },
  );
}

export async function scheduleDowngrade(
  stripe: Stripe,
  managed: ManagedStripeSubscription,
  target: SelfServeIndividualPlanTier,
  idempotencyKey: string,
): Promise<void> {
  const plan = currentPlanOf(managed);
  const block = downgradeBlockOf(plan, cancelAtOf(managed.subscription));
  if (block) throw createError.conflict(DOWNGRADE_BLOCK_MESSAGE[block]);

  const current = currentPriceOf(managed.subscription);
  const switchesCadence = target === plan && current !== null && !sellsCadence(plan, current);
  if (
    !current ||
    !isSelfServeIndividualPlanTier(plan) ||
    !(switchesCadence || lowerPlansThan(plan).includes(target))
  ) {
    throw createError.validation(
      `${getBillingPlanPricing(target).label} is not a smaller plan than your current one.`,
    );
  }

  const targetPrice = await resolveTargetPrice(target, current);
  if (!targetPrice) {
    throw createError.conflict(
      `${getBillingPlanPricing(target).label} is not available in your billing currency. Nothing was changed.`,
    );
  }

  const existingScheduleId = idOf(managed.subscription.schedule);
  const schedule = existingScheduleId
    ? await stripe.subscriptionSchedules.retrieve(existingScheduleId)
    : await stripe.subscriptionSchedules.create(
        { from_subscription: managed.subscription.id },
        { idempotencyKey: `${idempotencyKey}:schedule` },
      );
  const phase = currentPhaseOf(schedule);
  if (!phase) {
    throw createError
      .serviceUnavailable(
        'Your billing period could not be read. Nothing was changed; please try again.',
      )
      .asUserSafe();
  }

  const discounts = phaseDiscountsOf(phase);
  await stripe.subscriptionSchedules.update(
    schedule.id,
    {
      end_behavior: 'release',
      proration_behavior: 'none',
      phases: [
        {
          start_date: phase.start_date,
          end_date: phase.end_date,
          items: phaseItemsOf(phase),
          discounts,
          ...(phase.trial_end ? { trial_end: phase.trial_end } : {}),
        },
        {
          items: [{ price: targetPrice.priceId, quantity: 1 }],
          discounts,
          duration: { interval: STRIPE_INTERVAL[targetPrice.price.interval], interval_count: 1 },
          metadata: { plan_tier: target },
        },
      ],
    },
    { idempotencyKey: `${idempotencyKey}:phases` },
  );
}

export interface KeptPlan {
  managed: ManagedStripeSubscription;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export async function keepCurrentPlan(
  stripe: Stripe,
  managed: ManagedStripeSubscription,
  idempotencyKey: string,
): Promise<KeptPlan> {
  const subscription = await releaseAndResume(stripe, managed.subscription, idempotencyKey);
  return {
    managed: { ...managed, subscription },
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: isoFromSeconds(subscription.canceled_at),
  };
}

async function releaseAndResume(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  idempotencyKey: string,
): Promise<Stripe.Subscription> {
  const scheduleId = idOf(subscription.schedule);
  if (scheduleId) {
    await stripe.subscriptionSchedules.release(
      scheduleId,
      {},
      { idempotencyKey: `${idempotencyKey}:release` },
    );
  }
  const expand = ['items.data.price'];
  if (subscription.cancel_at_period_end) {
    return stripe.subscriptions.update(
      subscription.id,
      { cancel_at_period_end: false, expand },
      { idempotencyKey: `${idempotencyKey}:resume` },
    );
  }
  if (subscription.cancel_at) {
    return stripe.subscriptions.update(
      subscription.id,
      { cancel_at: '', expand },
      { idempotencyKey: `${idempotencyKey}:resume` },
    );
  }
  return stripe.subscriptions.retrieve(subscription.id, { expand });
}

export type TeamSeatStripe = Pick<Stripe, 'subscriptions'>;

export class SeatTypePaymentPendingError extends Error {
  readonly paymentUrl: string | null;

  constructor(pending: { paymentUrl: string | null }) {
    super('The Premium seat charge has not completed');
    this.name = 'SeatTypePaymentPendingError';
    this.paymentUrl = pending.paymentUrl;
  }
}

export interface TeamSeatMove {
  seats: TeamSeatQuantities;
  charge: boolean;
  idempotencyKey: string | null;
}

export interface TeamSeatBillingHandle {
  seats: TeamSeatQuantities;
  paidThrough: string | null;
  assertChangeable(): void;
  moveSeat(move: TeamSeatMove): Promise<TeamSeatQuantities>;
}

function requireSeatQuantities(subscription: Stripe.Subscription): TeamSeatQuantities {
  const seats = resolveSeatQuantities(subscription.items.data);
  if (!seats) {
    throw createError.conflict(
      'This subscription is not billed at a current Team seat price, so its seat types cannot be changed here. Nothing was changed.',
    );
  }
  return seats;
}

function requireChangeableSubscription(subscription: Stripe.Subscription): void {
  if (!isEntitledSubscriptionStatus(subscription.status)) {
    throw createError.conflict(
      'Resolve the current billing status in Manage billing before changing seat types. Nothing was changed.',
    );
  }
  if (subscription.cancel_at_period_end || subscription.cancel_at) {
    throw createError.conflict(
      'This plan is scheduled to end, so seat types cannot be changed. Resume the subscription from billing first. Nothing was charged.',
    );
  }
  if (subscription.pending_update) {
    throw createError.conflict(
      'An earlier seat change is waiting for its payment to complete. Finish or cancel that payment in Manage billing first.',
    );
  }
}

async function seatPriceId(
  seatType: TeamSeatType,
  subscription: Stripe.Subscription,
): Promise<string> {
  const interval = checkoutBillingIntervalFromStripePrice(
    subscription.items.data[0]?.price.recurring,
  );
  const selection = interval
    ? await getPriceSelectionForCurrency(
        teamSeatPlanTier(seatType),
        interval,
        subscription.currency,
      )
    : null;
  if (!selection || selection.currency.toLowerCase() !== subscription.currency.toLowerCase()) {
    throw createError.conflict(
      `${TEAM_SEAT_TYPE_LABELS[seatType]} seats are not sold in ${subscription.currency.toUpperCase()} with this billing period. Nothing was changed.`,
    );
  }
  return selection.priceId;
}

async function seatLineUpdate(
  subscription: Stripe.Subscription,
  seatType: TeamSeatType,
  quantity: number,
): Promise<Stripe.SubscriptionUpdateParams.Item> {
  const line = seatLineItemOfType(subscription.items.data, seatType);
  return line
    ? { id: line.id, quantity }
    : { price: await seatPriceId(seatType, subscription), quantity };
}

function hostedInvoiceUrl(subscription: Stripe.Subscription): string | null {
  const invoice = subscription.latest_invoice;
  return invoice && typeof invoice === 'object' ? (invoice.hosted_invoice_url ?? null) : null;
}

/**
 * Moves seats between the two lines of one Team subscription by writing both
 * quantities as absolute values, so repeating the call lands the same state. A
 * charged move follows the seat increase policy: invoiced now, renewal date
 * unchanged. An uncharged move changes only what the next renewal bills.
 */
async function moveTeamSeat(
  stripe: TeamSeatStripe,
  subscription: Stripe.Subscription,
  move: TeamSeatMove,
): Promise<TeamSeatQuantities> {
  const items = [
    await seatLineUpdate(subscription, 'standard', move.seats.standard),
    await seatLineUpdate(subscription, 'premium', move.seats.premium),
  ];
  const updated = await stripe.subscriptions.update(
    subscription.id,
    move.charge
      ? {
          items,
          proration_behavior: 'always_invoice',
          billing_cycle_anchor: 'unchanged',
          payment_behavior: 'pending_if_incomplete',
          expand: ['latest_invoice'],
        }
      : { items, proration_behavior: 'none' },
    move.idempotencyKey
      ? { idempotencyKey: `seat-type:${subscription.id}:${move.idempotencyKey}` }
      : undefined,
  );
  if (updated.pending_update) {
    throw new SeatTypePaymentPendingError({ paymentUrl: hostedInvoiceUrl(updated) });
  }
  const applied = requireSeatQuantities(updated);
  if (applied.standard !== move.seats.standard || applied.premium !== move.seats.premium) {
    logger.error(
      { subscriptionId: subscription.id, expected: move.seats, applied },
      'Stripe returned a seat type change without the requested quantities applied',
    );
    throw createError.internal('The seat change could not be verified with the payment provider');
  }
  return applied;
}

export async function openTeamSeatBilling(
  stripe: TeamSeatStripe,
  subscriptionId: string,
): Promise<TeamSeatBillingHandle> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });
  const period = getSubscriptionPeriod(subscription);
  return {
    seats: requireSeatQuantities(subscription),
    paidThrough: period ? new Date(period.end * 1000).toISOString() : null,
    assertChangeable: () => requireChangeableSubscription(subscription),
    moveSeat: (move) => moveTeamSeat(stripe, subscription, move),
  };
}
