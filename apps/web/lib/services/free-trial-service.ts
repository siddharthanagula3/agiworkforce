import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { logger } from '@/lib/logger';
import type { SubscriptionInfo } from '@/lib/services/subscription-service';
import { getModelMetadataById } from '@agiworkforce/types';
export { FREE_TRIAL_MODEL, FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import {
  getInternalUsageUnitMicrousd,
  getPlanFiveHourUsageBudgetMicrousd,
  getPlanMonthlyUsageBudgetMicrousd,
  getPlanWeeklyUsageBudgetMicrousd,
  toPublicUsagePercentage,
} from '@/lib/server/managed-usage-policy';
import { LLMCostCalculator, type TokenUsage } from '@/lib/services/llm-cost-calculator';

export const FREE_TRIAL_INTERNAL_USAGE_POLICY = Object.freeze({
  unitMicrousd: getInternalUsageUnitMicrousd(),
  fiveHourBudgetMicrousd: getPlanFiveHourUsageBudgetMicrousd('free'),
  fiveHourWindowHours: 5,
  weeklyBudgetMicrousd: getPlanWeeklyUsageBudgetMicrousd('free'),
  weeklyWindowHours: 7 * 24,
  monthlyBudgetMicrousd: getPlanMonthlyUsageBudgetMicrousd('free'),
});

export type FreeTrialReservation = {
  kind: 'free_trial';
  userId: string;
  requestId: string;
  reservedMicrousd: number;
};

type FreeTrialSettlementOutcome = 'completed' | 'failed' | 'cancelled';

type FreeTrialUsageSnapshotRow = {
  five_hour_used_microusd: number | string;
  weekly_used_microusd: number | string;
  monthly_used_microusd: number | string;
  five_hour_oldest_at: string | Date | null;
  weekly_oldest_at: string | Date | null;
  account_period_end: string | Date;
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
  sessionUsagePercentage: number;
  sessionResetAt: string | null;
  weeklyUsagePercentage: number;
  weeklyResetAt: string | null;
  hasUsageRemaining: boolean;
};

const FREE_USAGE_SNAPSHOT_SQL = `
  with account_anchor as (
    select created_at,
           greatest(
             0,
             (extract(year from now())::integer - extract(year from created_at)::integer) * 12
               + extract(month from now())::integer
               - extract(month from created_at)::integer
           ) as month_guess
    from public.profiles
    where id = $1
  ),
  account_month as (
    select created_at,
           greatest(
             0,
             month_guess - case
               when created_at + make_interval(months => month_guess) > now() then 1
               else 0
             end
           ) as elapsed_months
    from account_anchor
  ),
  account_period as (
    select created_at + make_interval(months => elapsed_months) as period_start,
           created_at + make_interval(months => elapsed_months + 1) as period_end
    from account_month
  ),
  relevant_usage as (
    select reservation.created_at,
           coalesce(reservation.actual_cost_microusd, reservation.reserved_microusd) as used_microusd
    from public.free_daily_usage_reservations as reservation
    cross join account_period
    where reservation.user_id = $1
      and reservation.created_at >= least(
        now() - $3 * interval '1 hour',
        account_period.period_start
      )
  )
  select coalesce(sum(used_microusd) filter (
           where created_at >= now() - $2 * interval '1 hour'
         ), 0)::bigint as five_hour_used_microusd,
         coalesce(sum(used_microusd) filter (
           where created_at >= now() - $3 * interval '1 hour'
         ), 0)::bigint as weekly_used_microusd,
         coalesce(sum(used_microusd) filter (
           where created_at >= account_period.period_start
         ), 0)::bigint as monthly_used_microusd,
         min(created_at) filter (
           where created_at >= now() - $2 * interval '1 hour' and used_microusd > 0
         ) as five_hour_oldest_at,
         min(created_at) filter (
           where created_at >= now() - $3 * interval '1 hour' and used_microusd > 0
         ) as weekly_oldest_at,
         account_period.period_end as account_period_end
  from account_period
  left join relevant_usage on true
  group by account_period.period_start, account_period.period_end`;

type FreeTrialBudgetResult =
  | { ok: true; maxOutputTokens: number }
  | { ok: false; code: 'budget_reached' };

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

export function fitFreeTrialOutputBudget(input: {
  reservation: FreeTrialReservation;
  provider: string;
  model: string;
  estimatedInputTokens: number;
  requestedMaxOutputTokens: number;
  priorCostDollars?: number;
}): FreeTrialBudgetResult {
  const promptTokens = toNonNegativeInteger(input.estimatedInputTokens);
  const priorCostDollars = Number.isFinite(input.priorCostDollars)
    ? Math.max(0, input.priorCostDollars ?? 0)
    : 0;
  const requestedMaxOutputTokens = toNonNegativeInteger(input.requestedMaxOutputTokens);
  if (requestedMaxOutputTokens === 0 || input.reservation.reservedMicrousd <= 0) {
    return { ok: false, code: 'budget_reached' };
  }

  const costFor = (nextOutputTokens: number): number =>
    Math.ceil(
      (priorCostDollars +
        LLMCostCalculator.calculateCostDollars(input.provider, input.model, {
          promptTokens,
          completionTokens: nextOutputTokens,
          totalTokens: promptTokens + nextOutputTokens,
        })) *
        1_000_000,
    );

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
  priorCostDollars?: number;
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
    priorCostDollars: input.priorCostDollars,
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

export async function getFreeTrialPublicUsage(
  db: DatabaseAdapter,
  userId: string,
): Promise<FreeTrialPublicUsage> {
  const {
    fiveHourBudgetMicrousd,
    fiveHourWindowHours,
    weeklyBudgetMicrousd,
    weeklyWindowHours,
    monthlyBudgetMicrousd,
  } = FREE_TRIAL_INTERNAL_USAGE_POLICY;
  const [snapshot] = await db.query<FreeTrialUsageSnapshotRow>(FREE_USAGE_SNAPSHOT_SQL, [
    userId,
    fiveHourWindowHours,
    weeklyWindowHours,
  ]);

  if (!snapshot) {
    return {
      usagePercentage: 0,
      resetAt: null,
      sessionUsagePercentage: 0,
      sessionResetAt: null,
      weeklyUsagePercentage: 0,
      weeklyResetAt: null,
      hasUsageRemaining: true,
    };
  }

  const fiveHourUsed = toNonNegativeInteger(snapshot.five_hour_used_microusd);
  const weeklyUsed = toNonNegativeInteger(snapshot.weekly_used_microusd);
  const monthlyUsed = toNonNegativeInteger(snapshot.monthly_used_microusd);

  return {
    usagePercentage: toPublicUsagePercentage(monthlyUsed, monthlyBudgetMicrousd),
    resetAt: toIsoTimestamp(snapshot.account_period_end),
    sessionUsagePercentage: toPublicUsagePercentage(fiveHourUsed, fiveHourBudgetMicrousd),
    sessionResetAt: getRollingResetAt(snapshot.five_hour_oldest_at, fiveHourWindowHours),
    weeklyUsagePercentage: toPublicUsagePercentage(weeklyUsed, weeklyBudgetMicrousd),
    weeklyResetAt: getRollingResetAt(snapshot.weekly_oldest_at, weeklyWindowHours),
    hasUsageRemaining:
      fiveHourUsed < fiveHourBudgetMicrousd &&
      weeklyUsed < weeklyBudgetMicrousd &&
      monthlyUsed < monthlyBudgetMicrousd,
  };
}

export async function beginFreeTrialRequest(params: {
  userId: string;
  requestId: string;
}): Promise<ReserveResult> {
  const db = createClaimedUserScopedDb(getNeonDb(), {
    userId: params.userId,
    organizationId: null,
  });
  const {
    fiveHourBudgetMicrousd,
    fiveHourWindowHours,
    weeklyBudgetMicrousd,
    weeklyWindowHours,
    monthlyBudgetMicrousd,
  } = FREE_TRIAL_INTERNAL_USAGE_POLICY;

  return db.transaction(async (tx) => {
    await tx.execute('insert into public.profiles (id) values ($1) on conflict (id) do nothing', [
      params.userId,
    ]);

    await tx.execute(
      `insert into public.website_auto_economy_trial_usage
         (user_id, prompt_count, period_tokens_used, period_started_at,
          daily_cost_microusd, daily_reserved_microusd, daily_started_at,
          first_prompt_at, last_prompt_at)
       values ($1, 0, 0, now(), 0, 0, now(), now(), now())
       on conflict (user_id) do nothing`,
      [params.userId],
    );

    const [lockedUsage] = await tx.query<{ user_id: string }>(
      `select user_id
       from public.website_auto_economy_trial_usage
       where user_id = $1
       for update`,
      [params.userId],
    );
    if (!lockedUsage) throw new Error('Free-tier usage ledger unavailable');

    const [existingReservation] = await tx.query<FreeTrialReservationRow>(
      `select window_started_at, reserved_microusd, settled_at
       from public.free_daily_usage_reservations
       where user_id = $1 and request_id = $2
       for update`,
      [params.userId, params.requestId],
    );
    if (existingReservation) return { ok: false, code: 'budget_reached' };

    const [snapshot] = await tx.query<FreeTrialUsageSnapshotRow>(FREE_USAGE_SNAPSHOT_SQL, [
      params.userId,
      fiveHourWindowHours,
      weeklyWindowHours,
    ]);
    if (!snapshot) throw new Error('Free-tier usage snapshot unavailable');

    const remainingMicrousd = Math.max(
      0,
      Math.min(
        fiveHourBudgetMicrousd - toNonNegativeInteger(snapshot.five_hour_used_microusd),
        weeklyBudgetMicrousd - toNonNegativeInteger(snapshot.weekly_used_microusd),
        monthlyBudgetMicrousd - toNonNegativeInteger(snapshot.monthly_used_microusd),
      ),
    );
    if (remainingMicrousd === 0) return { ok: false, code: 'budget_reached' };

    const reserved = await tx.execute(
      `insert into public.free_daily_usage_reservations
         (user_id, request_id, window_started_at, reserved_microusd)
       values ($1, $2, now(), $3)`,
      [params.userId, params.requestId, remainingMicrousd],
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

export async function settleFreeTrialRequest(params: {
  reservation: FreeTrialReservation;
  outcome: FreeTrialSettlementOutcome;
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  measuredCostDollars?: number;
}): Promise<void> {
  const usage = params.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const tokens = Math.max(0, Math.floor(usage.totalTokens));
  const measuredCostMicrousd = Number.isFinite(params.measuredCostDollars)
    ? Math.ceil(Math.max(0, params.measuredCostDollars ?? 0) * 1_000_000)
    : params.provider && params.model
      ? LLMCostCalculator.calculateCostMicrousd(params.provider, params.model, usage)
      : 0;
  const minimumCompletedChargeMicrousd =
    params.outcome === 'completed' ? FREE_TRIAL_INTERNAL_USAGE_POLICY.unitMicrousd : 0;
  // Settlement is reached from stream teardown and from a durable workflow
  // step, neither of which carries the request's connection, so the scope is
  // derived from the reservation's own owner rather than left unbound.
  const db = createClaimedUserScopedDb(getNeonDb(), {
    userId: params.reservation.userId,
    organizationId: null,
  });

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

      const costMicrousd = Math.min(
        toNonNegativeInteger(reservation.reserved_microusd),
        Math.max(measuredCostMicrousd, minimumCompletedChargeMicrousd),
      );

      await tx.execute(
        `update public.website_auto_economy_trial_usage
         set period_tokens_used = period_tokens_used + $2,
             prompt_count = prompt_count + 1,
             last_prompt_at = now()
         where user_id = $1`,
        [params.reservation.userId, tokens],
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

function toIsoTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getRollingResetAt(
  oldestAt: string | Date | null | undefined,
  windowHours: number,
): string | null {
  const oldestTimestamp = toIsoTimestamp(oldestAt);
  if (!oldestTimestamp) return null;
  return new Date(Date.parse(oldestTimestamp) + windowHours * 60 * 60 * 1_000).toISOString();
}

function toNonNegativeInteger(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function containsImageInput(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsImageInput);
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record['type'] === 'image_url' && record['image_url']) return true;
  return Object.values(record).some(containsImageInput);
}
