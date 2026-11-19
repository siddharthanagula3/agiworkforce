import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  getBillingPlanPricing,
  type BillingInterval,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { primarySeatLineItem, seatTypeOfLineItem } from '@/lib/billing/team-seat-items';
import { logger } from '@/lib/logger';
import { getTierMapping } from '@/lib/price-tier-mapping';
import { getPricePointForPriceId } from '@/lib/pricing';
import {
  STRIPE_RECONCILIATION_ALERT_RATIO,
  STRIPE_RECONCILIATION_MIN_SAMPLE,
} from '@/lib/services/stripe-settlement-reconciliation-service';

const DEFAULT_BATCH = 100;
const CENTS_PER_UNIT = 100;

export type BillingReconciliationField =
  'plan_tier' | 'unit_amount' | 'interval' | 'unregistered_price';

export type BillingComparisonGap =
  | 'stored_interval_unknown'
  | 'provider_cadence_unavailable'
  | 'currency_unavailable'
  | 'no_published_price'
  | 'unit_amount_unavailable';

export interface BillingLineDrift {
  priceId: string | null;
  currency: string | null;
  stripePlanTier: BillingPlanTier | null;
  expectedUnitAmount: number | null;
  stripeUnitAmount: number | null;
  fields: BillingReconciliationField[];
}

export interface BillingPlanDrift {
  userId: string;
  stripeSubscriptionId: string;
  storedPlanTier: string | null;
  fields: BillingReconciliationField[];
  lines: BillingLineDrift[];
}

export interface BillingIncompleteComparison {
  stripeSubscriptionId: string;
  userId: string;
  gaps: BillingComparisonGap[];
}

export interface BillingReconciliationReport {
  generatedAt: string;
  examined: number;
  diverged: number;
  uncomparable: number;
  divergenceRatio: number;
  alert: boolean;
  drifts: BillingPlanDrift[];
  incomplete: BillingIncompleteComparison[];
}

export interface BillingRecurringObservation {
  interval: string;
  intervalCount: number;
}

export interface BillingPriceObservation {
  storedPlanTier: string | null;
  storedInterval: BillingInterval | null;
  priceId: string | null;
  unitAmount: number | null;
  currency: string | null;
  recurring: BillingRecurringObservation | null;
}

interface BillingSubscriptionItem {
  price?: {
    id: string;
    unit_amount: number | null;
    currency: string;
    recurring?: { interval: string; interval_count: number } | null;
  };
}

interface BillingSubscription {
  items: {
    data: BillingSubscriptionItem[];
  };
}

interface BillingSubscriptionClient {
  subscriptions: {
    retrieve(subscriptionId: string): Promise<BillingSubscription>;
  };
}

interface StoredSubscriptionRow {
  user_id: string;
  stripe_subscription_id: string;
  plan_tier: string | null;
  billing_interval: string | null;
}

const SELECT_STRIPE_BILLED_SUBSCRIPTIONS = `
  select user_id, stripe_subscription_id, plan_tier, billing_interval
    from public.subscriptions
   where stripe_subscription_id is not null
     and stripe_subscription_id <> ''
   order by stripe_price_reconciled_at asc nulls first
   limit $1`;

const STAMP_EXAMINED_SUBSCRIPTIONS = `
  update public.subscriptions
     set stripe_price_reconciled_at = now()
   where stripe_subscription_id = any($1::text[])`;

const REQUEUE_UNDELIVERED_SUBSCRIPTIONS = `
  update public.subscriptions
     set stripe_price_reconciled_at = null
   where stripe_subscription_id = any($1::text[])`;

const PROVIDER_CADENCE: Record<BillingInterval, BillingRecurringObservation> = {
  monthly: { interval: 'month', intervalCount: 1 },
  yearly: { interval: 'year', intervalCount: 1 },
};

/** The list price in the smallest currency unit, or null where none is published. */
export function expectedUnitAmount(
  tier: BillingPlanTier,
  interval: BillingInterval,
  currency: string,
): number | null {
  const pricing = getBillingPlanPricing(tier);
  const normalized = currency.toLowerCase();
  if (normalized === 'inr') {
    const listedInr = interval === 'yearly' ? pricing.yearlyPriceInr : pricing.monthlyPriceInr;
    return typeof listedInr === 'number' ? listedInr * CENTS_PER_UNIT : null;
  }
  if (normalized !== 'usd') return null;
  const listed = interval === 'yearly' ? pricing.yearlyPriceUsd : pricing.monthlyPriceUsd;
  return typeof listed === 'number' && listed > 0 ? listed * CENTS_PER_UNIT : null;
}

/**
 * Compares what this deployment entitles against what Stripe is charging.
 * Neither side is repaired here: a price that moved is a decision, not a bug
 * to heal silently, and the report is what a human acts on.
 */
export function compareBilledPrice(observation: BillingPriceObservation): {
  fields: BillingReconciliationField[];
  stripePlanTier: BillingPlanTier | null;
  expected: number | null;
  gaps: BillingComparisonGap[];
} {
  const fields: BillingReconciliationField[] = [];
  const gaps: BillingComparisonGap[] = [];
  const entry = observation.priceId ? getTierMapping()[observation.priceId] : undefined;
  if (!entry) {
    return { fields: ['unregistered_price'], stripePlanTier: null, expected: null, gaps };
  }

  if (observation.storedPlanTier !== entry.tier) fields.push('plan_tier');

  let intervalDiverged = false;
  if (observation.storedInterval === null) {
    gaps.push('stored_interval_unknown');
  } else if (observation.storedInterval !== entry.interval) {
    intervalDiverged = true;
  }
  if (observation.recurring === null) {
    gaps.push('provider_cadence_unavailable');
  } else {
    const cadence = PROVIDER_CADENCE[entry.interval];
    if (
      observation.recurring.interval !== cadence.interval ||
      observation.recurring.intervalCount !== cadence.intervalCount
    ) {
      intervalDiverged = true;
    }
  }
  if (intervalDiverged) fields.push('interval');

  const pricedTier =
    (observation.priceId ? getPricePointForPriceId(observation.priceId)?.plan : undefined) ??
    entry.tier;
  const expected = observation.currency
    ? expectedUnitAmount(pricedTier, entry.interval, observation.currency)
    : null;
  if (observation.currency === null) {
    gaps.push('currency_unavailable');
  } else if (expected === null) {
    gaps.push('no_published_price');
  } else if (observation.unitAmount === null) {
    gaps.push('unit_amount_unavailable');
  } else if (observation.unitAmount !== expected) {
    fields.push('unit_amount');
  }

  return { fields, stripePlanTier: entry.tier, expected, gaps };
}

function billedLineItems(subscription: BillingSubscription): BillingSubscriptionItem[] {
  const items = subscription.items.data;
  const primary = primarySeatLineItem(items);
  if (!primary) return [];
  return [
    primary,
    ...items.filter((item) => item !== primary && seatTypeOfLineItem(item) !== null),
  ];
}

function toObservation(
  row: StoredSubscriptionRow,
  item: BillingSubscriptionItem | undefined,
): BillingPriceObservation {
  const price = item?.price;
  return {
    storedPlanTier: row.plan_tier,
    storedInterval: toInterval(row.billing_interval),
    priceId: price?.id ?? null,
    unitAmount: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    recurring: price?.recurring
      ? { interval: price.recurring.interval, intervalCount: price.recurring.interval_count }
      : null,
  };
}

function toInterval(value: string | null): BillingInterval | null {
  return value === 'monthly' || value === 'yearly' ? value : null;
}

export async function reconcileBilledPlans(options: {
  db: DatabaseAdapter;
  stripe: BillingSubscriptionClient;
  batch?: number;
}): Promise<BillingReconciliationReport> {
  const rows = await options.db.query<StoredSubscriptionRow>(SELECT_STRIPE_BILLED_SUBSCRIPTIONS, [
    options.batch ?? DEFAULT_BATCH,
  ]);

  const drifts: BillingPlanDrift[] = [];
  const incomplete: BillingIncompleteComparison[] = [];
  let examined = 0;
  let uncomparable = 0;

  for (const row of rows) {
    let subscription: BillingSubscription;
    try {
      subscription = await options.stripe.subscriptions.retrieve(row.stripe_subscription_id);
    } catch (error) {
      uncomparable += 1;
      logger.warn(
        { error, stripeSubscriptionId: row.stripe_subscription_id },
        'Billed plan reconciliation could not read a subscription from Stripe',
      );
      continue;
    }

    examined += 1;
    const items = billedLineItems(subscription);
    const lines: BillingLineDrift[] = [];
    const gaps = new Set<BillingComparisonGap>();
    for (const item of items.length > 0 ? items : [undefined]) {
      const observation = toObservation(row, item);
      const result = compareBilledPrice(observation);
      for (const gap of result.gaps) gaps.add(gap);
      if (result.fields.length === 0) continue;
      lines.push({
        priceId: observation.priceId,
        currency: observation.currency,
        stripePlanTier: result.stripePlanTier,
        expectedUnitAmount: result.expected,
        stripeUnitAmount: observation.unitAmount,
        fields: result.fields,
      });
    }

    if (gaps.size > 0) {
      incomplete.push({
        stripeSubscriptionId: row.stripe_subscription_id,
        userId: row.user_id,
        gaps: [...gaps],
      });
    }
    if (lines.length === 0) continue;

    drifts.push({
      userId: row.user_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      storedPlanTier: row.plan_tier,
      fields: [...new Set(lines.flatMap((line) => line.fields))],
      lines,
    });
  }

  if (rows.length > 0) {
    await options.db.execute(STAMP_EXAMINED_SUBSCRIPTIONS, [
      rows.map((row) => row.stripe_subscription_id),
    ]);
  }
  const diverged = drifts.length;
  const divergenceRatio = examined === 0 ? 0 : diverged / examined;

  return {
    generatedAt: new Date().toISOString(),
    examined,
    diverged,
    uncomparable,
    divergenceRatio,
    alert:
      examined >= STRIPE_RECONCILIATION_MIN_SAMPLE &&
      divergenceRatio > STRIPE_RECONCILIATION_ALERT_RATIO,
    drifts,
    incomplete,
  };
}

export async function requeueSubscriptionsForReview(
  db: DatabaseAdapter,
  stripeSubscriptionIds: readonly string[],
): Promise<void> {
  if (stripeSubscriptionIds.length === 0) return;
  await db.execute(REQUEUE_UNDELIVERED_SUBSCRIPTIONS, [stripeSubscriptionIds]);
}
