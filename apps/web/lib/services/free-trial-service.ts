import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import type { SubscriptionInfo } from '@/lib/services/subscription-service';
export { FREE_TRIAL_MODEL, FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';

/**
 * Private free-plan usage policy. This module is server-only, so the exact
 * ceiling and reset window cannot leak into browser bundles or response copy.
 * The values are deliberately centralized for operational adjustment without
 * changing the client contract.
 */
export const FREE_TRIAL_INTERNAL_USAGE_POLICY = Object.freeze({
  tokenBudget: 200_000,
  resetAfterDays: 30,
});

export type FreeTrialReservation = {
  kind: 'free_trial';
  userId: string;
  requestId: string;
};

type ReserveResult =
  | { ok: true; reservation: FreeTrialReservation }
  | { ok: false; code: 'budget_reached' };

export function buildFreeWebsiteSubscription(userId: string): SubscriptionInfo {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);

  return {
    id: `website-free:${userId}`,
    user_id: userId,
    plan_tier: 'free',
    status: 'active',
    current_period_start: now,
    current_period_end: periodEnd,
    stripe_subscription_id: null,
    stripe_price_id: null,
  };
}

export function isFreePlanTier(planTier: string | null | undefined): boolean {
  return (planTier ?? '').toLowerCase() === 'free';
}

export function isFreeTrialRequest(params: {
  requestedModel: string;
  planTier: string | null | undefined;
}): boolean {
  return (
    isFreePlanTier(params.planTier) &&
    FREE_TRIAL_MODELS.includes(params.requestedModel.trim().toLowerCase())
  );
}

/**
 * Gate a free-tier request against the cumulative token budget BEFORE running
 * it. With full agentic capability (tool loops, sandbox, web search) the output
 * size is unbounded, so we cannot reserve an estimate up front — instead we
 * gate on the usage already spent this period and record the ACTUAL tokens
 * afterwards via {@link recordFreeTrialTokens}.
 *
 * One atomic statement ensures the row exists and resets `period_tokens_used`
 * to 0 when the 30-day period has rolled over, then returns the current usage.
 * The JS gate below rejects once prior usage has reached the budget. Concurrent
 * requests may both pass (a soft budget) but each records its actual tokens, so
 * the next request after the budget is crossed is rejected — bounded overage,
 * acceptable for a free tier.
 */
export async function beginFreeTrialRequest(params: {
  userId: string;
  requestId: string;
}): Promise<ReserveResult> {
  const db = getNeonDb();
  const { tokenBudget, resetAfterDays } = FREE_TRIAL_INTERNAL_USAGE_POLICY;

  await db.execute('insert into public.profiles (id) values ($1) on conflict (id) do nothing', [
    params.userId,
  ]);

  const rows = await db.query<{ period_tokens_used: number }>(
    `insert into public.website_auto_economy_trial_usage as t
       (user_id, prompt_count, period_tokens_used, period_started_at, first_prompt_at, last_prompt_at)
     values ($1, 0, 0, now(), now(), now())
     on conflict (user_id) do update
       set period_started_at = case
             when now() - t.period_started_at >= $2 * interval '1 day' then now()
             else t.period_started_at end,
           period_tokens_used = case
             when now() - t.period_started_at >= $2 * interval '1 day' then 0
             else t.period_tokens_used end,
           last_prompt_at = now()
     returning period_tokens_used`,
    [params.userId, resetAfterDays],
  );

  const periodTokensUsed = rows[0]?.period_tokens_used ?? 0;
  if (periodTokensUsed >= tokenBudget) {
    return { ok: false, code: 'budget_reached' };
  }

  return {
    ok: true,
    reservation: {
      kind: 'free_trial',
      userId: params.userId,
      requestId: params.requestId,
    },
  };
}

/**
 * Record the ACTUAL tokens a completed free-tier request consumed (input +
 * output, including tool-loop turns). Called once the completion settles in the
 * stream/non-stream response builders. Best-effort: a failure here is logged,
 * never surfaced to the user, and the next request reconciles via the budget
 * gate anyway.
 */
export async function recordFreeTrialTokens(params: {
  userId: string;
  requestId: string;
  tokens: number;
}): Promise<void> {
  const used = Math.max(0, Math.floor(params.tokens));
  if (used === 0) return;
  const db = getNeonDb();

  try {
    await db.execute(
      `with recorded as (
         insert into public.usage_events (user_id, event_type, quantity, metadata)
         values ($1, $2, $3, $4::jsonb)
         on conflict do nothing
         returning 1
       )
       update public.website_auto_economy_trial_usage as t
       set period_tokens_used = t.period_tokens_used + $3,
           prompt_count = t.prompt_count + 1,
           last_prompt_at = now()
       where t.user_id = $1
         and exists (select 1 from recorded)`,
      [
        params.userId,
        'website_auto_economy_trial_tokens_recorded',
        used,
        JSON.stringify({ requestId: params.requestId, recordedTokens: used }),
      ],
    );
  } catch (error) {
    logger.warn(
      { error, userId: params.userId, requestId: params.requestId },
      'Free-tier token accounting failed',
    );
  }
}
