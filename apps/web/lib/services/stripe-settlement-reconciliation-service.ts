import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { getSubscriptionPeriod } from '@/lib/stripe-types';
import { toStoredSubscriptionStatus } from '@/app/api/stripe-webhook/lib/subscription-status';
import { updateSubscriptionFromStripeSubscription } from '@/app/api/stripe-webhook/lib/db';

export const STRIPE_RECONCILIATION_ALERT_RATIO = 0.05;
export const STRIPE_RECONCILIATION_MIN_SAMPLE = 20;
const DEFAULT_BATCH = 100;

export type StripeReconciliationField =
  | 'status'
  | 'current_period_start'
  | 'current_period_end'
  | 'cancel_at_period_end'
  | 'missing_in_stripe';

export interface StripeReconciliationDrift {
  userId: string;
  stripeSubscriptionId: string;
  fields: StripeReconciliationField[];
  repaired: boolean;
  repairError?: string;
}

export interface StripeReconciliationSummary {
  examined: number;
  diverged: number;
  repaired: number;
  unrepaired: number;
  missingInStripe: number;
  divergenceRatio: number;
  alert: boolean;
  drifts: StripeReconciliationDrift[];
}

interface StoredSubscriptionRow {
  user_id: string;
  stripe_subscription_id: string;
  status: string | null;
  plan_tier: string | null;
  current_period_start: string | Date | null;
  current_period_end: string | Date | null;
  cancel_at_period_end: boolean | null;
}

const SELECT_STRIPE_BILLED_SUBSCRIPTIONS = `
  select user_id, stripe_subscription_id, status, plan_tier,
         current_period_start, current_period_end, cancel_at_period_end
    from public.subscriptions
   where stripe_subscription_id is not null
     and stripe_subscription_id <> ''
   order by updated_at asc nulls first
   limit $1`;

function epochOf(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? Math.floor(time / 1000) : null;
}

function isMissingInStripe(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const statusCode =
    'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : undefined;
  return code === 'resource_missing' || statusCode === 404;
}

function compare(
  stored: StoredSubscriptionRow,
  subscription: Stripe.Subscription,
): StripeReconciliationField[] {
  const fields: StripeReconciliationField[] = [];
  const period = getSubscriptionPeriod(subscription);

  if ((stored.status ?? '') !== toStoredSubscriptionStatus(subscription.status)) {
    fields.push('status');
  }
  if (period && epochOf(stored.current_period_start) !== period.start) {
    fields.push('current_period_start');
  }
  if (period && epochOf(stored.current_period_end) !== period.end) {
    fields.push('current_period_end');
  }
  if ((stored.cancel_at_period_end ?? false) !== subscription.cancel_at_period_end) {
    fields.push('cancel_at_period_end');
  }

  return fields;
}

export async function reconcileStripeSettlement(input: {
  db: DatabaseAdapter;
  stripe: Stripe;
  limit?: number;
}): Promise<StripeReconciliationSummary> {
  const rows = await input.db.query<StoredSubscriptionRow>(SELECT_STRIPE_BILLED_SUBSCRIPTIONS, [
    input.limit ?? DEFAULT_BATCH,
  ]);

  const drifts: StripeReconciliationDrift[] = [];
  let missingInStripe = 0;
  let repaired = 0;

  for (const stored of rows) {
    let subscription: Stripe.Subscription;
    try {
      subscription = await input.stripe.subscriptions.retrieve(stored.stripe_subscription_id);
    } catch (error) {
      if (!isMissingInStripe(error)) throw error;
      missingInStripe += 1;
      drifts.push({
        userId: stored.user_id,
        stripeSubscriptionId: stored.stripe_subscription_id,
        fields: ['missing_in_stripe'],
        repaired: false,
      });
      logger.error(
        { userId: stored.user_id, stripeSubscriptionId: stored.stripe_subscription_id },
        'Stripe does not know this subscription id; refusing to guess its terminal state',
      );
      continue;
    }

    const fields = compare(stored, subscription);
    if (fields.length === 0) continue;

    try {
      await updateSubscriptionFromStripeSubscription(input.db, input.stripe, subscription);
      repaired += 1;
      drifts.push({
        userId: stored.user_id,
        stripeSubscriptionId: stored.stripe_subscription_id,
        fields,
        repaired: true,
      });
      logger.warn(
        { userId: stored.user_id, stripeSubscriptionId: stored.stripe_subscription_id, fields },
        'Repaired subscription drift from Stripe',
      );
    } catch (error) {
      const repairError = error instanceof Error ? error.message : String(error);
      drifts.push({
        userId: stored.user_id,
        stripeSubscriptionId: stored.stripe_subscription_id,
        fields,
        repaired: false,
        repairError,
      });
      logger.error(
        {
          userId: stored.user_id,
          stripeSubscriptionId: stored.stripe_subscription_id,
          fields,
          repairError,
        },
        'Subscription drift from Stripe could not be repaired',
      );
    }
  }

  const examined = rows.length;
  const diverged = drifts.length;
  const divergenceRatio = examined === 0 ? 0 : diverged / examined;

  return {
    examined,
    diverged,
    repaired,
    unrepaired: diverged - repaired,
    missingInStripe,
    divergenceRatio,
    alert:
      examined >= STRIPE_RECONCILIATION_MIN_SAMPLE &&
      divergenceRatio > STRIPE_RECONCILIATION_ALERT_RATIO,
    drifts,
  };
}
