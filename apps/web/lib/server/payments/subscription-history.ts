import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

import type {
  NormalizedSubscription,
  NormalizedSubscriptionStatus,
  PaymentProviderId,
} from './domain';

export const SUBSCRIPTION_HISTORY_PAGE_LIMIT = 50;

export type SubscriptionTransitionOutcome = 'recorded' | 'unchanged' | 'duplicate';

export interface SubscriptionStateTransitionInput {
  organizationId: string;
  subscription: NormalizedSubscription;
  providerEventId?: string | null;
  occurredAt?: Date | null;
}

export interface SubscriptionStateTransition {
  provider: PaymentProviderId;
  subscriptionReference: string;
  previousStatus: NormalizedSubscriptionStatus | null;
  status: NormalizedSubscriptionStatus;
  quantity: number;
  cancelAtPeriodEnd: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  providerEventId: string | null;
  occurredAt: string;
}

interface TransitionRow {
  payment_provider: PaymentProviderId;
  subscription_reference: string;
  previous_status: NormalizedSubscriptionStatus | null;
  status: NormalizedSubscriptionStatus;
  quantity: number | string;
  cancel_at_period_end: boolean;
  period_start: string | Date | null;
  period_end: string | Date | null;
  provider_event_id: string | null;
  occurred_at: string | Date;
}

function isoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function sameState(row: TransitionRow, subscription: NormalizedSubscription): boolean {
  return (
    row.status === subscription.status &&
    Number(row.quantity) === subscription.quantity &&
    row.cancel_at_period_end === subscription.cancelAtPeriodEnd &&
    isoOrNull(row.period_end) === (subscription.period?.endsAt.toISOString() ?? null)
  );
}

/**
 * Appends the transition a provider event describes, and only when it is one:
 * a webhook that repeats the state already recorded writes nothing, and a
 * replay carrying the same provider event id is absorbed by the partial unique
 * index rather than counted twice.
 */
export async function recordSubscriptionStateTransition(
  db: DatabaseAdapter,
  input: SubscriptionStateTransitionInput,
): Promise<SubscriptionTransitionOutcome> {
  const { organizationId, subscription } = input;

  const [latest] = await db.query<TransitionRow>(
    `select payment_provider, subscription_reference, previous_status, status, quantity,
            cancel_at_period_end, period_start, period_end, provider_event_id, occurred_at
       from public.organization_subscription_state_transitions
      where organization_id = $1::uuid
        and payment_provider = $2::text
        and subscription_reference = $3::text
      order by occurred_at desc, created_at desc
      limit 1`,
    [organizationId, subscription.provider, subscription.subscriptionReference],
  );

  if (latest && sameState(latest, subscription)) return 'unchanged';

  const written = await db.query<{ id: string }>(
    `insert into public.organization_subscription_state_transitions
       (organization_id, payment_provider, subscription_reference, previous_status, status,
        quantity, cancel_at_period_end, period_start, period_end, provider_event_id, occurred_at)
     values ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::integer, $7::boolean,
             $8::timestamptz, $9::timestamptz, $10::text, coalesce($11::timestamptz, now()))
     on conflict (payment_provider, subscription_reference, provider_event_id)
       where provider_event_id is not null do nothing
     returning id`,
    [
      organizationId,
      subscription.provider,
      subscription.subscriptionReference,
      latest?.status ?? null,
      subscription.status,
      subscription.quantity,
      subscription.cancelAtPeriodEnd,
      subscription.period?.startsAt.toISOString() ?? null,
      subscription.period?.endsAt.toISOString() ?? null,
      input.providerEventId ?? null,
      input.occurredAt?.toISOString() ?? null,
    ],
  );

  if (written.length === 0) return 'duplicate';

  logger.info(
    {
      organizationId,
      provider: subscription.provider,
      subscriptionId: subscription.subscriptionReference,
      previousStatus: latest?.status ?? null,
      status: subscription.status,
    },
    'Subscription state transition recorded',
  );
  return 'recorded';
}

export async function readSubscriptionStateHistory(
  db: DatabaseAdapter,
  organizationId: string,
  limit = SUBSCRIPTION_HISTORY_PAGE_LIMIT,
): Promise<SubscriptionStateTransition[]> {
  const rows = await db.query<TransitionRow>(
    `select payment_provider, subscription_reference, previous_status, status, quantity,
            cancel_at_period_end, period_start, period_end, provider_event_id, occurred_at
       from public.organization_subscription_state_transitions
      where organization_id = $1::uuid
      order by occurred_at desc, created_at desc
      limit $2::integer`,
    [organizationId, Math.min(Math.max(limit, 1), SUBSCRIPTION_HISTORY_PAGE_LIMIT)],
  );

  return rows.map((row) => ({
    provider: row.payment_provider,
    subscriptionReference: row.subscription_reference,
    previousStatus: row.previous_status,
    status: row.status,
    quantity: Number(row.quantity),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    periodStart: isoOrNull(row.period_start),
    periodEnd: isoOrNull(row.period_end),
    providerEventId: row.provider_event_id,
    occurredAt: isoOrNull(row.occurred_at) ?? new Date(0).toISOString(),
  }));
}
