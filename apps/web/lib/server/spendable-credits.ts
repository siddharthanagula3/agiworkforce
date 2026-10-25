import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import { resolveSubscriptionBillingSource } from '@/lib/server/subscription-billing-owner';

export interface SpendableCreditState {
  availableMicrousd: number | null;
  availableCents: number | null;
  overageEnabled: boolean;
  /** Billed by Stripe or an app store, so the account holder buys credits and switches them on. */
  selfServe: boolean;
}

interface SpendableCreditRow {
  overage_enabled: boolean;
  available_microusd: number | string | null;
  plan_tier: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  apple_original_transaction_id: string | null;
  google_purchase_token: string | null;
}

const SELF_SERVE_BILLING_SOURCES: ReadonlySet<string> = new Set(['stripe', 'apple', 'google']);

const SELECT_SPENDABLE_CREDITS = `
  select
    subscription.overage_enabled,
    subscription.plan_tier,
    subscription.status,
    subscription.stripe_customer_id,
    subscription.stripe_subscription_id,
    subscription.apple_original_transaction_id,
    subscription.google_purchase_token,
    coalesce((
      select greatest(least(
               credits.credits_allocated_microusd - credits.credits_used_microusd,
               credits.top_up_allocated_microusd
             ), 0)
        from public.token_credits credits
       where credits.user_id = subscription.user_id
         and credits.period_end > now()
       order by credits.period_end desc
       limit 1
    ), 0) as available_microusd
  from public.subscriptions subscription
  where subscription.user_id = $1
  limit 1`;

export async function getSpendableCredits(
  db: DatabaseAdapter,
  userId: string,
): Promise<SpendableCreditState> {
  try {
    const rows = await db.query<SpendableCreditRow>(SELECT_SPENDABLE_CREDITS, [userId]);
    const row = rows[0];
    if (row === undefined) {
      return { availableMicrousd: 0, availableCents: 0, overageEnabled: false, selfServe: false };
    }
    const available = Number(row.available_microusd ?? 0);
    const availableMicrousd =
      Number.isFinite(available) && available > 0 ? Math.floor(available) : 0;
    return {
      availableMicrousd,
      availableCents: ledgerCentsFromMicrousd(availableMicrousd),
      overageEnabled: row.overage_enabled === true,
      selfServe: SELF_SERVE_BILLING_SOURCES.has(resolveSubscriptionBillingSource(row)),
    };
  } catch (error) {
    logger.warn({ error, userId }, 'Spendable credit lookup failed; reporting unknown balance');
    return {
      availableMicrousd: null,
      availableCents: null,
      overageEnabled: false,
      selfServe: false,
    };
  }
}
