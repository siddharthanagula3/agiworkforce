import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export interface ExpiredCodeTrial {
  userId: string;
  previousPlanTier: string;
  endedAt: string;
}

const EXPIRE_ENDED_CODE_TRIALS_SQL = `
  with ended as (
    select id, user_id, plan_tier, current_period_end
      from public.subscriptions
     where status = 'trialing'
       and current_period_end <= $1
       and stripe_subscription_id is null
       and apple_original_transaction_id is null
       and google_purchase_token is null
     order by current_period_end, id
     limit $2
     for update skip locked
  )
  update public.subscriptions subscription
     set status = 'canceled',
         plan_tier = 'free',
         canceled_at = ended.current_period_end,
         cancel_at_period_end = false,
         updated_at = now()
    from ended
   where subscription.id = ended.id
  returning ended.user_id,
            ended.plan_tier as previous_plan_tier,
            ended.current_period_end::text as ended_at`;

export async function expireEndedCodeTrials(
  db: DatabaseAdapter,
  now: Date,
  limit: number,
): Promise<ExpiredCodeTrial[]> {
  const rows = await db.query<{ user_id: string; previous_plan_tier: string; ended_at: string }>(
    EXPIRE_ENDED_CODE_TRIALS_SQL,
    [now.toISOString(), limit],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    previousPlanTier: row.previous_plan_tier,
    endedAt: row.ended_at,
  }));
}
