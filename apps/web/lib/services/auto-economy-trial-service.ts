import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import type { SubscriptionInfo } from '@/lib/services/subscription-service';

export const AUTO_ECONOMY_TRIAL_MODEL = 'auto-economy';
export const AUTO_ECONOMY_TRIAL_PROMPT_LIMIT = 3;
export const AUTO_ECONOMY_TRIAL_MAX_OUTPUT_TOKENS = 1200;
export const AUTO_ECONOMY_TRIAL_MAX_INPUT_CHARS = 24_000;

export type AutoEconomyTrialReservation = {
  kind: 'auto_economy_trial';
  userId: string;
  requestId: string;
  promptCount: number;
  promptLimit: number;
};

type ReserveResult =
  | { ok: true; reservation: AutoEconomyTrialReservation }
  | { ok: false; code: 'limit_reached'; promptLimit: number };

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

export function isAutoEconomyTrialRequest(params: {
  requestedModel: string;
  planTier: string | null | undefined;
}): boolean {
  return (
    isFreePlanTier(params.planTier) &&
    params.requestedModel.trim().toLowerCase() === AUTO_ECONOMY_TRIAL_MODEL
  );
}

export async function reserveAutoEconomyTrialPrompt(params: {
  userId: string;
  requestId: string;
}): Promise<ReserveResult> {
  const db = getNeonDb();

  await db.execute('insert into public.profiles (id) values ($1) on conflict (id) do nothing', [
    params.userId,
  ]);

  const rows = await db.query<{ prompt_count: number }>(
    `insert into public.website_auto_economy_trial_usage
       (user_id, prompt_count, first_prompt_at, last_prompt_at)
     values ($1, 1, now(), now())
     on conflict (user_id) do update
       set prompt_count = public.website_auto_economy_trial_usage.prompt_count + 1,
           last_prompt_at = now()
       where public.website_auto_economy_trial_usage.prompt_count < $2
     returning prompt_count`,
    [params.userId, AUTO_ECONOMY_TRIAL_PROMPT_LIMIT],
  );

  const promptCount = rows[0]?.prompt_count;
  if (typeof promptCount !== 'number') {
    return {
      ok: false,
      code: 'limit_reached',
      promptLimit: AUTO_ECONOMY_TRIAL_PROMPT_LIMIT,
    };
  }

  await db
    .execute(
      `insert into public.usage_events (user_id, event_type, quantity, metadata)
       values ($1, $2, 1, $3::jsonb)`,
      [
        params.userId,
        'website_auto_economy_trial_prompt_reserved',
        JSON.stringify({
          requestId: params.requestId,
          promptCount,
          promptLimit: AUTO_ECONOMY_TRIAL_PROMPT_LIMIT,
        }),
      ],
    )
    .catch((error) => {
      logger.warn(
        { error, userId: params.userId, requestId: params.requestId },
        'Auto Economy trial usage event insert failed',
      );
    });

  return {
    ok: true,
    reservation: {
      kind: 'auto_economy_trial',
      userId: params.userId,
      requestId: params.requestId,
      promptCount,
      promptLimit: AUTO_ECONOMY_TRIAL_PROMPT_LIMIT,
    },
  };
}

export async function refundAutoEconomyTrialPrompt(params: {
  userId: string;
  requestId: string;
  reason: string;
}): Promise<void> {
  const db = getNeonDb();

  await db.execute(
    `update public.website_auto_economy_trial_usage
       set prompt_count = greatest(prompt_count - 1, 0),
           last_prompt_at = now()
     where user_id = $1`,
    [params.userId],
  );

  await db
    .execute(
      `insert into public.usage_events (user_id, event_type, quantity, metadata)
       values ($1, $2, 1, $3::jsonb)`,
      [
        params.userId,
        'website_auto_economy_trial_prompt_refunded',
        JSON.stringify({ requestId: params.requestId, reason: params.reason }),
      ],
    )
    .catch((error) => {
      logger.warn(
        { error, userId: params.userId, requestId: params.requestId },
        'Auto Economy trial refund event insert failed',
      );
    });
}
