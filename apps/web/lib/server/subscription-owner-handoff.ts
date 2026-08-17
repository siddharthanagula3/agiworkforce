import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { isEntitledSubscriptionStatus } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { resolveEffectiveSubscriptionBillingStatus } from '@/lib/server/subscription-billing-owner';

export type SubscriptionOwnerChannel = 'stripe' | 'ios' | 'android';

export interface SubscriptionOwnerHandoffRow {
  plan_tier?: string | null;
  status?: string | null;
  stripe_subscription_id?: string | null;
  apple_original_transaction_id?: string | null;
  google_purchase_token?: string | null;
  current_period_end?: string | Date | null;
}

export interface SubscriptionOwnerHandoff {
  incumbents: SubscriptionOwnerChannel[];
  incumbentEntitled: boolean;
  blocked: boolean;
  clearsStripe: boolean;
  clearsApple: boolean;
  clearsGoogle: boolean;
}

const NO_INCUMBENT: SubscriptionOwnerHandoff = {
  incumbents: [],
  incumbentEntitled: false,
  blocked: false,
  clearsStripe: false,
  clearsApple: false,
  clearsGoogle: false,
};

function hasIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function recordedChannels(row: SubscriptionOwnerHandoffRow): SubscriptionOwnerChannel[] {
  const channels: SubscriptionOwnerChannel[] = [];
  if (hasIdentifier(row.stripe_subscription_id)) channels.push('stripe');
  if (hasIdentifier(row.apple_original_transaction_id)) channels.push('ios');
  if (hasIdentifier(row.google_purchase_token)) channels.push('android');
  return channels;
}

export function resolveSubscriptionOwnerHandoff(
  existing: SubscriptionOwnerHandoffRow | null | undefined,
  incoming: SubscriptionOwnerChannel,
  now = Date.now(),
): SubscriptionOwnerHandoff {
  if (!existing) return NO_INCUMBENT;

  const incumbents = recordedChannels(existing).filter((channel) => channel !== incoming);
  if (incumbents.length === 0) return NO_INCUMBENT;

  const incumbentEntitled = isEntitledSubscriptionStatus(
    resolveEffectiveSubscriptionBillingStatus(
      {
        plan_tier: existing.plan_tier ?? '',
        status: existing.status ?? 'none',
        stripe_subscription_id: existing.stripe_subscription_id ?? null,
        apple_original_transaction_id: existing.apple_original_transaction_id ?? null,
        google_purchase_token: existing.google_purchase_token ?? null,
        current_period_end: existing.current_period_end ?? null,
      },
      now,
    ),
  );

  return {
    incumbents,
    incumbentEntitled,
    blocked: incumbentEntitled,
    clearsStripe: !incumbentEntitled && incumbents.includes('stripe'),
    clearsApple: !incumbentEntitled && incumbents.includes('ios'),
    clearsGoogle: !incumbentEntitled && incumbents.includes('android'),
  };
}

export function subscriptionOwnerHandoffConflictMessage(handoff: SubscriptionOwnerHandoff): string {
  if (handoff.incumbents.includes('stripe')) {
    return 'This account already has an active web subscription. Cancel it on the web before subscribing in the app.';
  }
  return 'This account already has a subscription managed by another billing provider.';
}

export async function applySubscriptionOwnerHandoff(
  db: DatabaseAdapter,
  userId: string,
  incoming: SubscriptionOwnerChannel,
  now = Date.now(),
): Promise<SubscriptionOwnerHandoff> {
  const [existing] = await db.query<SubscriptionOwnerHandoffRow>(
    `select plan_tier, status, stripe_subscription_id,
            apple_original_transaction_id, google_purchase_token, current_period_end
       from subscriptions
      where user_id = $1
      limit 1`,
    [userId],
  );

  const handoff = resolveSubscriptionOwnerHandoff(existing, incoming, now);

  if (handoff.blocked) {
    logger.error(
      { userId, incoming, incumbents: handoff.incumbents },
      'CRITICAL: refusing billing ownership handoff while the previous channel is still entitled',
    );
    return handoff;
  }

  if (handoff.clearsStripe || handoff.clearsApple || handoff.clearsGoogle) {
    await db.execute(
      `update subscriptions
          set stripe_subscription_id = case when $2 then null else stripe_subscription_id end,
              stripe_price_id = case when $2 then null else stripe_price_id end,
              apple_original_transaction_id = case when $3 then null else apple_original_transaction_id end,
              google_purchase_token = case when $4 then null else google_purchase_token end,
              updated_at = now()
        where user_id = $1`,
      [userId, handoff.clearsStripe, handoff.clearsApple, handoff.clearsGoogle],
    );
    logger.info(
      { userId, incoming, incumbents: handoff.incumbents },
      'Released the previous billing owner so the new channel owns the subscription row',
    );
  }

  return handoff;
}
