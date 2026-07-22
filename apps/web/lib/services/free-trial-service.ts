import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import type { SubscriptionInfo } from '@/lib/services/subscription-service';
import { getModelMetadataById } from '@agiworkforce/types';
export { FREE_TRIAL_MODEL, FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import {
  getPlanDailyUsageBudgetMicrousd,
  toPublicUsagePercentage,
} from '@/lib/server/managed-usage-policy';
import { LLMCostCalculator, type TokenUsage } from '@/lib/services/llm-cost-calculator';

/**
 * Private free-plan usage policy. This module is server-only, so the exact
 * ceiling and reset window cannot leak into browser bundles or response copy.
 * The values are deliberately centralized for operational adjustment without
 * changing the client contract.
 */
export const FREE_TRIAL_INTERNAL_USAGE_POLICY = Object.freeze({
  dailyBudgetMicrousd: getPlanDailyUsageBudgetMicrousd('free'),
  resetAfterHours: 24,
});

export type FreeTrialReservation = {
  kind: 'free_trial';
  userId: string;
  requestId: string;
  /** Server-only provider-cost ceiling reserved under the rolling-window lock. */
  reservedMicrousd: number;
};

type FreeTrialSettlementOutcome = 'completed' | 'failed' | 'cancelled';

type FreeTrialUsageWindowRow = {
  daily_cost_microusd: number | string;
  daily_reserved_microusd: number | string;
  daily_started_at: string | Date;
  window_expired: boolean;
};

type FreeTrialReservationRow = {
  window_started_at: string | Date;
  reserved_microusd: number | string;
  settled_at: string | Date | null;
};

type ReserveResult =
  | { ok: true; reservation: FreeTrialReservation }
  | { ok: false; code: 'budget_reached' };

export type FreeTrialPublicUsage = {
  usagePercentage: number;
  resetAt: string | null;
  hasUsageRemaining: boolean;
};

type FreeTrialBudgetResult =
  | { ok: true; maxOutputTokens: number }
  | { ok: false; code: 'budget_reached' };

/**
 * Bound provider input without trusting tokenizer heuristics. UTF-8 bytes are
 * a conservative ceiling for text tokens. Vision tokenization is provider-
 * specific, so an image reserves the model's full declared input window until
 * a verified per-provider image estimator exists.
 */
export function estimateConservativeFreeInputTokens(input: {
  model: string;
  messages: unknown;
  tools?: unknown;
}): number {
  const payload = { messages: input.messages, ...(input.tools ? { tools: input.tools } : {}) };
  const serializedBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (!containsImageInput(payload)) return serializedBytes + 64;

  const metadata = getModelMetadataById(input.model);
  const modelInputCeiling = metadata?.contextWindow;
  return Math.max(serializedBytes + 64, modelInputCeiling ?? 1_000_000);
}

/** Fit one provider invocation inside its immutable private reservation. */
export function fitFreeTrialOutputBudget(input: {
  reservation: FreeTrialReservation;
  provider: string;
  model: string;
  estimatedInputTokens: number;
  requestedMaxOutputTokens: number;
  observedUsage?: TokenUsage;
}): FreeTrialBudgetResult {
  const observed = input.observedUsage ?? {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  const promptTokens =
    toNonNegativeInteger(observed.promptTokens) + toNonNegativeInteger(input.estimatedInputTokens);
  const priorCompletionTokens = toNonNegativeInteger(observed.completionTokens);
  const requestedMaxOutputTokens = toNonNegativeInteger(input.requestedMaxOutputTokens);
  if (requestedMaxOutputTokens === 0 || input.reservation.reservedMicrousd <= 0) {
    return { ok: false, code: 'budget_reached' };
  }

  const costFor = (nextOutputTokens: number): number =>
    LLMCostCalculator.calculateCostMicrousd(input.provider, input.model, {
      promptTokens,
      completionTokens: priorCompletionTokens + nextOutputTokens,
      totalTokens: promptTokens + priorCompletionTokens + nextOutputTokens,
      cacheReadInputTokens: observed.cacheReadInputTokens,
      cacheCreationInputTokens: observed.cacheCreationInputTokens,
      cacheCreation1hInputTokens: observed.cacheCreation1hInputTokens,
    });

  if (costFor(1) > input.reservation.reservedMicrousd) {
    return { ok: false, code: 'budget_reached' };
  }
  if (costFor(requestedMaxOutputTokens) <= input.reservation.reservedMicrousd) {
    return { ok: true, maxOutputTokens: requestedMaxOutputTokens };
  }

  let low = 1;
  let high = requestedMaxOutputTokens - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (costFor(middle) <= input.reservation.reservedMicrousd) low = middle;
    else high = middle - 1;
  }
  return { ok: true, maxOutputTokens: low };
}

/** Apply the private Free allowance to the exact request crossing provider egress. */
export function applyFreeTrialProviderBudget(input: {
  reservation: FreeTrialReservation;
  provider: string;
  request: {
    model: string;
    messages: unknown;
    tools?: unknown;
    max_tokens: number;
    usePromptCache?: boolean;
  };
  observedUsage?: TokenUsage;
}): FreeTrialBudgetResult {
  const result = fitFreeTrialOutputBudget({
    reservation: input.reservation,
    provider: input.provider,
    model: input.request.model,
    estimatedInputTokens: estimateConservativeFreeInputTokens({
      model: input.request.model,
      messages: input.request.messages,
      tools: input.request.tools,
    }),
    requestedMaxOutputTokens: input.request.max_tokens,
    observedUsage: input.observedUsage,
  });
  if (result.ok) {
    input.request.max_tokens = result.maxOutputTokens;
    input.request.usePromptCache = false;
  }
  return result;
}

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
 * Read the active Free rolling-day window and discard its private operands at
 * the server boundary. Active reservations count as usage so concurrent work
 * cannot make the public meter look more available than admission control.
 */
export async function getFreeTrialPublicUsage(userId: string): Promise<FreeTrialPublicUsage> {
  const { dailyBudgetMicrousd, resetAfterHours } = FREE_TRIAL_INTERNAL_USAGE_POLICY;
  const [window] = await getNeonDb().query<FreeTrialUsageWindowRow>(
    `select daily_cost_microusd,
            daily_reserved_microusd,
            daily_started_at,
            now() - daily_started_at >= $2 * interval '1 hour' as window_expired
     from public.website_auto_economy_trial_usage
     where user_id = $1`,
    [userId, resetAfterHours],
  );

  if (!window || window.window_expired) {
    return { usagePercentage: 0, resetAt: null, hasUsageRemaining: true };
  }

  const used =
    toNonNegativeInteger(window.daily_cost_microusd) +
    toNonNegativeInteger(window.daily_reserved_microusd);
  const startedAt = new Date(toTimestampParameter(window.daily_started_at));
  const resetAt = Number.isNaN(startedAt.getTime())
    ? null
    : new Date(startedAt.getTime() + resetAfterHours * 60 * 60 * 1000).toISOString();

  return {
    usagePercentage: toPublicUsagePercentage(used, dailyBudgetMicrousd),
    resetAt,
    hasUsageRemaining: used < dailyBudgetMicrousd,
  };
}

/**
 * Atomically reserve the entire remaining private daily budget before provider
 * egress. The usage row is locked for the duration of the transaction, so a
 * concurrent request observes the reservation and fails closed.
 *
 * The durable reservation also records its rolling-window identity. Settlement
 * can therefore release unused capacity only from that original window and can
 * never charge a newer window when a slow request completes after rollover.
 */
export async function beginFreeTrialRequest(params: {
  userId: string;
  requestId: string;
}): Promise<ReserveResult> {
  const db = getNeonDb();
  const { dailyBudgetMicrousd, resetAfterHours } = FREE_TRIAL_INTERNAL_USAGE_POLICY;

  return db.transaction(async (tx) => {
    await tx.execute('insert into public.profiles (id) values ($1) on conflict (id) do nothing', [
      params.userId,
    ]);

    const [existingReservation] = await tx.query<FreeTrialReservationRow>(
      `select window_started_at, reserved_microusd, settled_at
       from public.free_daily_usage_reservations
       where user_id = $1 and request_id = $2
       for update`,
      [params.userId, params.requestId],
    );
    if (existingReservation) {
      // A request id owns at most one provider attempt. Replays must not share
      // its reservation or execute provider work a second time.
      return { ok: false, code: 'budget_reached' };
    }

    await tx.execute(
      `insert into public.website_auto_economy_trial_usage
         (user_id, prompt_count, period_tokens_used, period_started_at,
          daily_cost_microusd, daily_reserved_microusd, daily_started_at,
          first_prompt_at, last_prompt_at)
       values ($1, 0, 0, now(), 0, 0, now(), now(), now())
       on conflict (user_id) do nothing`,
      [params.userId],
    );

    let [window] = await tx.query<FreeTrialUsageWindowRow>(
      `select daily_cost_microusd,
              daily_reserved_microusd,
              daily_started_at,
              now() - daily_started_at >= $2 * interval '1 hour' as window_expired
       from public.website_auto_economy_trial_usage
       where user_id = $1
       for update`,
      [params.userId, resetAfterHours],
    );
    if (!window) throw new Error('Free-tier usage window unavailable');

    if (window.window_expired) {
      const [resetWindow] = await tx.query<{ daily_started_at: string | Date }>(
        `update public.website_auto_economy_trial_usage
         set daily_cost_microusd = 0,
             daily_reserved_microusd = 0,
             daily_started_at = now(),
             last_prompt_at = now()
         where user_id = $1
         returning daily_started_at`,
        [params.userId],
      );
      if (!resetWindow) throw new Error('Free-tier usage window reset failed');
      window = {
        daily_cost_microusd: 0,
        daily_reserved_microusd: 0,
        daily_started_at: resetWindow.daily_started_at,
        window_expired: false,
      };
    }

    const dailyCostMicrousd = toNonNegativeInteger(window.daily_cost_microusd);
    const dailyReservedMicrousd = toNonNegativeInteger(window.daily_reserved_microusd);
    const remainingMicrousd = Math.max(
      0,
      dailyBudgetMicrousd - dailyCostMicrousd - dailyReservedMicrousd,
    );
    if (remainingMicrousd === 0) return { ok: false, code: 'budget_reached' };

    const reserved = await tx.execute(
      `with reserved_window as (
         update public.website_auto_economy_trial_usage
         set daily_reserved_microusd = daily_reserved_microusd + $2,
             last_prompt_at = now()
         where user_id = $1
         returning daily_started_at
       )
       insert into public.free_daily_usage_reservations
         (user_id, request_id, window_started_at, reserved_microusd)
       select $1, $3, daily_started_at, $2
       from reserved_window`,
      [params.userId, remainingMicrousd, params.requestId],
    );
    if (reserved !== 1) throw new Error('Free-tier usage reservation failed');

    return {
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId: params.userId,
        requestId: params.requestId,
        reservedMicrousd: remainingMicrousd,
      },
    };
  });
}

/**
 * Reconcile a free-tier reservation with observed provider cost. A completed
 * response consumes at least the configured daily unit, so a one-unit Free
 * allowance means one completed response rather than unlimited tiny calls.
 * Repeated settlement is a no-op, and zero-usage failures still release their
 * reservation. Best-effort persistence preserves an already-produced provider
 * response if the accounting database is temporarily unavailable.
 */
export async function settleFreeTrialRequest(params: {
  reservation: FreeTrialReservation;
  outcome: FreeTrialSettlementOutcome;
  provider?: string;
  model?: string;
  usage?: TokenUsage;
}): Promise<void> {
  const usage = params.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const tokens = Math.max(0, Math.floor(usage.totalTokens));
  const measuredCostMicrousd =
    params.provider && params.model
      ? LLMCostCalculator.calculateCostMicrousd(params.provider, params.model, usage)
      : 0;
  const minimumCompletedChargeMicrousd =
    params.outcome === 'completed' ? FREE_TRIAL_INTERNAL_USAGE_POLICY.dailyBudgetMicrousd : 0;
  const costMicrousd = Math.min(
    params.reservation.reservedMicrousd,
    Math.max(measuredCostMicrousd, minimumCompletedChargeMicrousd),
  );
  const db = getNeonDb();

  try {
    await db.transaction(async (tx) => {
      const [reservation] = await tx.query<FreeTrialReservationRow>(
        `select window_started_at, reserved_microusd, settled_at
         from public.free_daily_usage_reservations
         where user_id = $1 and request_id = $2
         for update`,
        [params.reservation.userId, params.reservation.requestId],
      );
      if (!reservation || reservation.settled_at) return;

      await tx.execute(
        `update public.website_auto_economy_trial_usage as usage
         set daily_reserved_microusd = case
               when usage.daily_started_at = reservation.window_started_at
                 then greatest(0, usage.daily_reserved_microusd - reservation.reserved_microusd)
               else usage.daily_reserved_microusd end,
             daily_cost_microusd = case
               when usage.daily_started_at = reservation.window_started_at
                 then usage.daily_cost_microusd + $3
               else usage.daily_cost_microusd end,
             period_tokens_used = usage.period_tokens_used + $4,
             prompt_count = usage.prompt_count + 1,
             last_prompt_at = now()
         from public.free_daily_usage_reservations as reservation
         where usage.user_id = $1
           and reservation.user_id = usage.user_id
           and reservation.request_id = $2
           and reservation.settled_at is null`,
        [params.reservation.userId, params.reservation.requestId, costMicrousd, tokens],
      );

      const metadata = JSON.stringify({
        requestId: params.reservation.requestId,
        outcome: params.outcome,
        ...(params.provider ? { provider: params.provider } : {}),
        ...(params.model ? { model: params.model } : {}),
        recordedTokens: tokens,
      });
      await tx.execute(
        `with settled as (
           update public.free_daily_usage_reservations
           set actual_cost_microusd = $3,
               outcome = $4,
               settled_at = now()
           where user_id = $1 and request_id = $2 and settled_at is null
           returning 1
         )
         insert into public.usage_events (user_id, event_type, quantity, metadata)
         select $1, 'website_auto_economy_trial_usage_settled', $3, $5::jsonb
         from settled
         on conflict do nothing`,
        [
          params.reservation.userId,
          params.reservation.requestId,
          costMicrousd,
          params.outcome,
          metadata,
        ],
      );
    });
  } catch (error) {
    logger.warn(
      {
        error,
        userId: params.reservation.userId,
        requestId: params.reservation.requestId,
      },
      'Free-tier usage settlement failed',
    );
  }
}

function toNonNegativeInteger(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function toTimestampParameter(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function containsImageInput(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsImageInput);
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record['type'] === 'image_url' && record['image_url']) return true;
  return Object.values(record).some(containsImageInput);
}
