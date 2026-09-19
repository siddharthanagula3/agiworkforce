import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  getBillingPlanPricing,
  type BillingInterval,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { getTierMapping } from '@/lib/price-tier-mapping';
import {
  STRIPE_RECONCILIATION_ALERT_RATIO,
  STRIPE_RECONCILIATION_MIN_SAMPLE,
} from '@/lib/services/stripe-settlement-reconciliation-service';

const DEFAULT_BATCH = 100;
const CENTS_PER_UNIT = 100;

export type BillingReconciliationField =
  'plan_tier' | 'unit_amount' | 'interval' | 'unregistered_price';

export interface BillingPlanDrift {
  userId: string;
  stripeSubscriptionId: string;
  priceId: string | null;
  currency: string | null;
  storedPlanTier: string | null;
  stripePlanTier: BillingPlanTier | null;
  expectedUnitAmount: number | null;
  stripeUnitAmount: number | null;
  fields: BillingReconciliationField[];
}

export interface BillingReconciliationReport {
  generatedAt: string;
  examined: number;
  diverged: number;
  uncomparable: number;
  divergenceRatio: number;
  alert: boolean;
  drifts: BillingPlanDrift[];
}

export interface BillingPriceObservation {
  storedPlanTier: string | null;
  storedInterval: BillingInterval | null;
  priceId: string | null;
  unitAmount: number | null;
  currency: string | null;
}

interface BillingSubscription {
  items: {
    data: Array<{
      price?: {
        id: string;
        unit_amount: number | null;
        currency: string;
      };
    }>;
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
   order by updated_at asc nulls first
   limit $1`;

/** The list price in the smallest currency unit, or null where none is published. */
export function expectedUnitAmount(
  tier: BillingPlanTier,
  interval: BillingInterval,
  currency: string,
): number | null {
  const pricing = getBillingPlanPricing(tier);
  const normalized = currency.toLowerCase();
  if (normalized === 'inr') {
    return interval === 'monthly' && typeof pricing.monthlyPriceInr === 'number'
      ? pricing.monthlyPriceInr * CENTS_PER_UNIT
      : null;
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
} {
  const fields: BillingReconciliationField[] = [];
  const entry = observation.priceId ? getTierMapping()[observation.priceId] : undefined;
  if (!entry) {
    return { fields: ['unregistered_price'], stripePlanTier: null, expected: null };
  }

  if (observation.storedPlanTier !== entry.tier) fields.push('plan_tier');
  if (observation.storedInterval !== null && observation.storedInterval !== entry.interval) {
    fields.push('interval');
  }

  const expected = observation.currency
    ? expectedUnitAmount(entry.tier, entry.interval, observation.currency)
    : null;
  if (expected !== null && observation.unitAmount !== null && observation.unitAmount !== expected) {
    fields.push('unit_amount');
  }

  return { fields, stripePlanTier: entry.tier, expected };
}

function firstRecurringItem(subscription: BillingSubscription): {
  priceId: string | null;
  unitAmount: number | null;
  currency: string | null;
} {
  const price = subscription.items.data[0]?.price;
  return {
    priceId: price?.id ?? null,
    unitAmount: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
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
    const item = firstRecurringItem(subscription);
    const { fields, stripePlanTier, expected } = compareBilledPrice({
      storedPlanTier: row.plan_tier,
      storedInterval: toInterval(row.billing_interval),
      priceId: item.priceId,
      unitAmount: item.unitAmount,
      currency: item.currency,
    });
    if (fields.length === 0) continue;

    drifts.push({
      userId: row.user_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      priceId: item.priceId,
      currency: item.currency,
      storedPlanTier: row.plan_tier,
      stripePlanTier,
      expectedUnitAmount: expected,
      stripeUnitAmount: item.unitAmount,
      fields,
    });
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
  };
}
