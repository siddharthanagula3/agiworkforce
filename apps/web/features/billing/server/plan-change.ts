import 'server-only';

import type Stripe from 'stripe';
import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  getBillingPlanPricing,
  isSelfServeIndividualPlanTier,
  normalizeBillingPlanTier,
  type BillingInterval,
  type BillingPlanTier,
  type SelfServeIndividualPlanTier,
} from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { getPlanTierFromPriceId } from '@/lib/price-tier-mapping';
import { getPriceSelectionForCurrency } from '@/lib/server/localized-pricing-service';
import { checkoutBillingIntervalFromStripePrice } from '@/lib/server/stripe-plan-change';
import type {
  DowngradeBlock,
  DowngradeTarget,
  PlanChangeState,
  RecurringPrice,
  ScheduledPlanChange,
} from '../lib/billing-account-types';
import type { ManagedStripeSubscription } from './billing-account';

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
  return subscription.items.data[0] ?? null;
}

function currentPriceOf(subscription: Stripe.Subscription): RecurringPrice | null {
  const item = currentItemOf(subscription);
  return recurringPriceOf(item?.price, item?.quantity ?? 1);
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
  return normalizeBillingPlanTier(getPlanTierFromPriceId(priceId) ?? managed.row.plan_tier);
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
    current.interval === 'yearly' ? ['yearly', 'monthly'] : ['monthly'];
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
): Promise<ScheduledPlanChange | null> {
  const scheduleId = idOf(subscription.schedule);
  if (!scheduleId) return null;
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId, {
    expand: ['phases.items.price'],
  });
  const phase = upcomingPhaseOf(schedule);
  const item = phase?.items[0];
  if (!phase || !item) return null;
  const nextTier = getPlanTierFromPriceId(idOf(item.price));
  if (!nextTier) return null;
  const nextPlan = normalizeBillingPlanTier(nextTier);
  if (nextPlan === plan) return null;
  return {
    plan: nextPlan,
    effectiveAt: new Date(phase.start_date * 1000).toISOString(),
    price: isLivePrice(item.price) ? recurringPriceOf(item.price, item.quantity ?? 1) : null,
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
  const [scheduledChange, downgradeTargets] = await Promise.all([
    readScheduledChange(stripe, subscription, plan),
    !downgradeBlock && price && isSelfServeIndividualPlanTier(plan)
      ? downgradeTargetsOf(plan, price)
      : Promise.resolve([]),
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
  if (!current || !isSelfServeIndividualPlanTier(plan) || !lowerPlansThan(plan).includes(target)) {
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

export async function keepCurrentPlan(
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
