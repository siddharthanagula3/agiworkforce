import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { logger } from '@/lib/logger';
import type { SubscriptionInfo } from '@/lib/services/subscription-service';
import { chargeMicrousdForProviderCost, getModelMetadataById } from '@agiworkforce/types';
export { FREE_TRIAL_MODEL, FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { eventAllowsModel } from '@/lib/server/event-access';
import { rollingResetAt, toIsoTimestamp } from '@/lib/server/capability-limit-resets';
import {
  reserveEventSpend,
  settleEventSpend,
  type EventBudgetReservation,
} from '@/lib/server/event-budget';
import {
  getPlanFiveHourUsageBudgetMicrousd,
  getPlanMonthlyUsageBudgetMicrousd,
  getPlanWeeklyUsageBudgetMicrousd,
  toPublicUsagePercentage,
} from '@/lib/server/managed-usage-policy';
import { LLMCostCalculator, type TokenUsage } from '@/lib/services/llm-cost-calculator';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';

export const FREE_TRIAL_INTERNAL_USAGE_POLICY = Object.freeze({
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
  unmetered?: true;
  /**
   * Present only for a turn served by an event-promoted model, which spends the
   * global event ceiling. Permanently free models carry none: their cost
   * predates the event and is not charged to it.
   */
  eventBudget?: EventBudgetReservation;
};

type FreeTrialSettlementOutcome = 'completed' | 'failed' | 'cancelled';

export type FreeTrialCost = { tokenMicrousd: number; toolMicrousd: number };

export interface FreeTrialToolSpend {
  hold(providerMicrousd: number): boolean;
  settle(heldMicrousd: number, spentMicrousd: number): void;
  exhausted(): boolean;
}

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
  | { ok: false; code: 'budget_reached'; resetAt: string | null };

export type FreeTrialPublicUsage = {
  usagePercentage: number;
  resetAt: string | null;
  sessionUsagePercentage: number;
  sessionResetAt: string | null;
  weeklyUsagePercentage: number;
  weeklyResetAt: string | null;
  hasUsageRemaining: boolean;
  monthlyUsedMicrousd: number;
  weeklyUsedMicrousd: number;
  fiveHourUsedMicrousd: number;
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
  { ok: true; maxOutputTokens: number } | { ok: false; code: 'budget_reached' };

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
  priorCostMicrousd?: number;
}): FreeTrialBudgetResult {
  const promptTokens = toNonNegativeInteger(input.estimatedInputTokens);
  const priorCostMicrousd = nonNegativeMicrousd(input.priorCostMicrousd);
  const requestedMaxOutputTokens = toNonNegativeInteger(input.requestedMaxOutputTokens);
  if (requestedMaxOutputTokens === 0) {
    return { ok: false, code: 'budget_reached' };
  }
  if (input.reservation.unmetered) {
    return { ok: true, maxOutputTokens: requestedMaxOutputTokens };
  }
  if (input.reservation.reservedMicrousd <= 0) return { ok: false, code: 'budget_reached' };

  const costFor = (nextOutputTokens: number): number =>
    chargeMicrousdForProviderCost(
      priorCostMicrousd +
        LLMCostCalculator.calculateCostMicrousd(input.provider, input.model, {
          promptTokens,
          completionTokens: nextOutputTokens,
          totalTokens: promptTokens + nextOutputTokens,
        }),
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
  priorCostMicrousd?: number;
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
    priorCostMicrousd: input.priorCostMicrousd,
  });
  if (result.ok) {
    input.request.max_tokens = result.maxOutputTokens;
    input.request.usePromptCache = false;
  }
  return result;
}

export function freeTrialSpendMicrousd(
  reservation: FreeTrialReservation,
  cost: FreeTrialCost,
): number {
  return (
    (reservation.unmetered ? 0 : nonNegativeMicrousd(cost.tokenMicrousd)) +
    nonNegativeMicrousd(cost.toolMicrousd)
  );
}

export function createFreeTrialToolSpend(input: {
  reservation: FreeTrialReservation;
  spent: () => FreeTrialCost;
  record: (spentMicrousd: number) => void;
}): FreeTrialToolSpend {
  let heldMicrousd = 0;
  let exhausted = false;
  return {
    hold(providerMicrousd) {
      const spent = input.spent();
      const committed = freeTrialSpendMicrousd(input.reservation, {
        tokenMicrousd: spent.tokenMicrousd,
        toolMicrousd: spent.toolMicrousd + heldMicrousd + nonNegativeMicrousd(providerMicrousd),
      });
      if (chargeMicrousdForProviderCost(committed) > input.reservation.reservedMicrousd) {
        exhausted = true;
        return false;
      }
      heldMicrousd += nonNegativeMicrousd(providerMicrousd);
      return true;
    },
    settle(released, spentMicrousd) {
      heldMicrousd = Math.max(0, heldMicrousd - nonNegativeMicrousd(released));
      input.record(nonNegativeMicrousd(spentMicrousd));
    },
    exhausted: () => exhausted,
  };
}

export function scopeFreeTrialToolSpend(
  parent: FreeTrialToolSpend,
): FreeTrialToolSpend & { spentMicrousd(): number } {
  let spentMicrousd = 0;
  return {
    hold: (providerMicrousd) => parent.hold(providerMicrousd),
    settle(heldMicrousd, spent) {
      spentMicrousd += nonNegativeMicrousd(spent);
      parent.settle(heldMicrousd, spent);
    },
    exhausted: () => parent.exhausted(),
    spentMicrousd: () => spentMicrousd,
  };
}

export function fitsFreeTrialWindow(providerMicrousd: number): boolean {
  const { fiveHourBudgetMicrousd, weeklyBudgetMicrousd, monthlyBudgetMicrousd } =
    FREE_TRIAL_INTERNAL_USAGE_POLICY;
  return (
    chargeMicrousdForProviderCost(providerMicrousd) <=
    Math.min(fiveHourBudgetMicrousd, weeklyBudgetMicrousd, monthlyBudgetMicrousd)
  );
}

export function freeTrialRetryAfterSeconds(
  resetAt: string | null,
  nowMs: number = Date.now(),
): number | undefined {
  const resetMs = resetAt ? Date.parse(resetAt) : Number.NaN;
  if (!Number.isFinite(resetMs)) return undefined;
  return Math.max(1, Math.ceil((resetMs - nowMs) / 1_000));
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

/**
 * Whether this request is served through Free access.
 *
 * An active event promotion answers yes for the models it covers. The
 * promotion widens which models a Free account may name and remains bounded by
 * its shared event ceiling and by the account's Free windows.
 */
export function isFreeTrialRequest(params: {
  requestedModel: string;
  planTier: string | null | undefined;
}): boolean {
  if (!isFreePlanTier(params.planTier)) return false;
  const requestedModel = params.requestedModel.trim().toLowerCase();
  if (FREE_TRIAL_MODELS.includes(requestedModel)) return true;
  return eventAllowsModel(requestedModel, params.planTier);
}

/**
 * Reachable ONLY because the promotion is running, as opposed to free on its
 * own merits. This is what the global event ceiling is charged for: a
 * permanently free model costs what it has always cost, and billing that to the
 * event would exhaust the event budget on traffic the event did not create.
 */
export function isEventPromotedRequest(params: {
  requestedModel: string;
  planTier: string | null | undefined;
}): boolean {
  if (!isFreePlanTier(params.planTier)) return false;
  const requestedModel = params.requestedModel.trim().toLowerCase();
  if (FREE_TRIAL_MODELS.includes(requestedModel)) return false;
  return eventAllowsModel(requestedModel, params.planTier);
}

function usageFromSnapshot(snapshot: FreeTrialUsageSnapshotRow): {
  fiveHourUsed: number;
  weeklyUsed: number;
  monthlyUsed: number;
} {
  return {
    fiveHourUsed: toNonNegativeInteger(snapshot.five_hour_used_microusd),
    weeklyUsed: toNonNegativeInteger(snapshot.weekly_used_microusd),
    monthlyUsed: toNonNegativeInteger(snapshot.monthly_used_microusd),
  };
}

function remainingFromSnapshot(snapshot: FreeTrialUsageSnapshotRow): number {
  const { fiveHourBudgetMicrousd, weeklyBudgetMicrousd, monthlyBudgetMicrousd } =
    FREE_TRIAL_INTERNAL_USAGE_POLICY;
  const { fiveHourUsed, weeklyUsed, monthlyUsed } = usageFromSnapshot(snapshot);
  return Math.max(
    0,
    Math.min(
      fiveHourBudgetMicrousd - fiveHourUsed,
      weeklyBudgetMicrousd - weeklyUsed,
      monthlyBudgetMicrousd - monthlyUsed,
    ),
  );
}

function bindingResetAt(snapshot: FreeTrialUsageSnapshotRow): string | null {
  const {
    fiveHourBudgetMicrousd,
    fiveHourWindowHours,
    weeklyBudgetMicrousd,
    weeklyWindowHours,
    monthlyBudgetMicrousd,
  } = FREE_TRIAL_INTERNAL_USAGE_POLICY;
  const { fiveHourUsed, weeklyUsed, monthlyUsed } = usageFromSnapshot(snapshot);
  const windows = [
    {
      remaining: fiveHourBudgetMicrousd - fiveHourUsed,
      resetAt: getRollingResetAt(snapshot.five_hour_oldest_at, fiveHourWindowHours),
    },
    {
      remaining: weeklyBudgetMicrousd - weeklyUsed,
      resetAt: getRollingResetAt(snapshot.weekly_oldest_at, weeklyWindowHours),
    },
    {
      remaining: monthlyBudgetMicrousd - monthlyUsed,
      resetAt: toIsoTimestamp(snapshot.account_period_end),
    },
  ];
  const least = Math.min(...windows.map((window) => window.remaining));
  return windows
    .filter((window) => window.remaining === least)
    .map((window) => window.resetAt)
    .filter((reset): reset is string => reset !== null)
    .reduce<string | null>(
      (latest, reset) => (latest === null || reset > latest ? reset : latest),
      null,
    );
}

async function readFreeUsageSnapshot(
  db: DatabaseAdapter,
  userId: string,
): Promise<FreeTrialUsageSnapshotRow | undefined> {
  const { fiveHourWindowHours, weeklyWindowHours } = FREE_TRIAL_INTERNAL_USAGE_POLICY;
  const [snapshot] = await db.query<FreeTrialUsageSnapshotRow>(FREE_USAGE_SNAPSHOT_SQL, [
    userId,
    fiveHourWindowHours,
    weeklyWindowHours,
  ]);
  return snapshot;
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
  const snapshot = await readFreeUsageSnapshot(db, userId);

  if (!snapshot) {
    return {
      usagePercentage: 0,
      resetAt: null,
      sessionUsagePercentage: 0,
      sessionResetAt: null,
      weeklyUsagePercentage: 0,
      weeklyResetAt: null,
      hasUsageRemaining: true,
      monthlyUsedMicrousd: 0,
      weeklyUsedMicrousd: 0,
      fiveHourUsedMicrousd: 0,
    };
  }

  const { fiveHourUsed, weeklyUsed, monthlyUsed } = usageFromSnapshot(snapshot);

  return {
    usagePercentage: toPublicUsagePercentage(monthlyUsed, monthlyBudgetMicrousd),
    resetAt: toIsoTimestamp(snapshot.account_period_end),
    sessionUsagePercentage: toPublicUsagePercentage(fiveHourUsed, fiveHourBudgetMicrousd),
    sessionResetAt: getRollingResetAt(snapshot.five_hour_oldest_at, fiveHourWindowHours),
    weeklyUsagePercentage: toPublicUsagePercentage(weeklyUsed, weeklyBudgetMicrousd),
    weeklyResetAt: getRollingResetAt(snapshot.weekly_oldest_at, weeklyWindowHours),
    hasUsageRemaining: remainingFromSnapshot(snapshot) > 0,
    monthlyUsedMicrousd: monthlyUsed,
    weeklyUsedMicrousd: weeklyUsed,
    fiveHourUsedMicrousd: fiveHourUsed,
  };
}

export async function freeTrialResetAt(userId: string): Promise<string | null> {
  const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
  try {
    const snapshot = await readFreeUsageSnapshot(db, userId);
    return snapshot ? bindingResetAt(snapshot) : null;
  } catch (error) {
    logger.warn({ error, userId }, 'Free-tier reset time could not be read');
    return null;
  }
}

export async function beginFreeTrialRequest(params: {
  userId: string;
  requestId: string;
  /** The requested model is selectable only because the event promotes it. */
  eventPromoted?: boolean;
  freePoolRoute?: boolean;
  estimatedMicrousd?: number;
  leaseSeconds: number;
  provider: string;
  model: string;
}): Promise<ReserveResult> {
  const db = createClaimedUserScopedDb(getNeonDb(), {
    userId: params.userId,
    organizationId: null,
  });
  const unmetered = params.freePoolRoute === true ? { unmetered: true as const } : {};

  const userReservation = await db.transaction(async (tx): Promise<ReserveResult> => {
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
    if (existingReservation) return { ok: false, code: 'budget_reached', resetAt: null };

    const snapshot = await readFreeUsageSnapshot(tx, params.userId);
    if (!snapshot) throw new Error('Free-tier usage snapshot unavailable');

    const remainingMicrousd = remainingFromSnapshot(snapshot);
    const reserveMicrousd =
      params.estimatedMicrousd === undefined
        ? remainingMicrousd
        : Math.max(1, chargeMicrousdForProviderCost(params.estimatedMicrousd));
    if (remainingMicrousd === 0 || reserveMicrousd > remainingMicrousd) {
      if (params.freePoolRoute !== true) {
        return { ok: false, code: 'budget_reached', resetAt: bindingResetAt(snapshot) };
      }
      return {
        ok: true,
        reservation: {
          kind: 'free_trial',
          userId: params.userId,
          requestId: params.requestId,
          reservedMicrousd: 0,
          ...unmetered,
        },
      };
    }

    const reserved = await tx.execute(
      `insert into public.free_daily_usage_reservations
         (user_id, request_id, window_started_at, reserved_microusd,
          lease_expires_at, provider, model)
       values ($1, $2, now(), $3, now() + make_interval(secs => $4), $5, $6)`,
      [
        params.userId,
        params.requestId,
        reserveMicrousd,
        params.leaseSeconds,
        params.provider,
        params.model,
      ],
    );
    if (reserved !== 1) throw new Error('Free-tier usage reservation failed');

    return {
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId: params.userId,
        requestId: params.requestId,
        reservedMicrousd: reserveMicrousd,
        ...unmetered,
      },
    };
  });

  if (
    !userReservation.ok ||
    params.eventPromoted !== true ||
    userReservation.reservation.reservedMicrousd === 0
  ) {
    return userReservation;
  }

  const eventBudget = await reserveEventSpend(userReservation.reservation.reservedMicrousd);
  if (!eventBudget) {
    await settleFreeTrialRequest({ reservation: userReservation.reservation, outcome: 'failed' });
    return { ok: false, code: 'budget_reached', resetAt: null };
  }

  return { ok: true, reservation: { ...userReservation.reservation, eventBudget } };
}

export async function settleFreeTrialRequest(params: {
  reservation: FreeTrialReservation;
  outcome: FreeTrialSettlementOutcome;
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  cost?: FreeTrialCost;
}): Promise<void> {
  if (params.reservation.reservedMicrousd <= 0) return;

  const usage = params.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const tokens = Math.max(0, Math.floor(usage.totalTokens));
  const cost = params.cost ?? {
    tokenMicrousd:
      params.provider && params.model
        ? LLMCostCalculator.calculateCostMicrousd(params.provider, params.model, usage)
        : 0,
    toolMicrousd: 0,
  };
  const chargedMicrousd = chargeMicrousdForProviderCost(
    Math.ceil(freeTrialSpendMicrousd(params.reservation, cost)),
  );
  // Settlement is reached from stream teardown and from a durable workflow
  // step, neither of which carries the request's connection, so the scope is
  // derived from the reservation's own owner rather than left unbound.
  const db = createClaimedUserScopedDb(getNeonDb(), {
    userId: params.reservation.userId,
    organizationId: null,
  });

  // Null unless THIS call is the one that settled the row. A turn settled by an
  // earlier caller must not refund the global ceiling a second time.
  let settledCostMicrousd: number | null = null;

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
        chargedMicrousd,
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
      settledCostMicrousd = costMicrousd;
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

  // Hand the unspent remainder back to the global event ceiling. Reservations
  // are sized from the user's whole remaining window, so nearly all of each one
  // is returned; without this the event would stop at a fraction of its budget.
  // A settlement that threw leaves the reservation standing, which overstates
  // spend and ends the event early: the safe direction to be wrong.
  if (params.reservation.eventBudget && settledCostMicrousd !== null) {
    await settleEventSpend(params.reservation.eventBudget, settledCostMicrousd);
  }
}

export async function releaseExpiredFreeTrialReservations(
  db: DatabaseAdapter,
  limit: number,
): Promise<{ released: number; absorbedMicrousd: number }> {
  const rows = await db.query<{
    user_id: string;
    request_id: string;
    reserved_microusd: number | string;
    provider: string | null;
    model: string | null;
  }>(
    `with expired as (
       select id
         from public.free_daily_usage_reservations
        where settled_at is null
          and (lease_expires_at is null or lease_expires_at <= now())
        order by created_at
        limit $1
        for update skip locked
     ),
     released as (
       update public.free_daily_usage_reservations reservation
          set actual_cost_microusd = 0,
              outcome = 'failed',
              settled_at = now()
         from expired
        where reservation.id = expired.id
          and reservation.settled_at is null
       returning reservation.user_id, reservation.request_id, reservation.reserved_microusd,
                 reservation.provider, reservation.model
     ),
     recorded as (
       insert into public.usage_events (user_id, event_type, quantity, metadata)
       select released.user_id, 'website_auto_economy_trial_usage_settled', 0,
              jsonb_build_object('requestId', released.request_id, 'outcome', 'failed',
                                 'recordedTokens', 0, 'leaseExpired', true)
         from released
       on conflict do nothing
     )
     select user_id, request_id, reserved_microusd, provider, model from released`,
    [limit],
  );

  let absorbedMicrousd = 0;
  for (const row of rows) {
    const reservedMicrousd = toNonNegativeInteger(row.reserved_microusd);
    absorbedMicrousd += reservedMicrousd;
    await recordSettledProviderCost({
      userId: row.user_id,
      organizationId: null,
      provider: row.provider ?? 'unknown',
      model: row.model,
      actualCostCents: ledgerCentsFromMicrousd(reservedMicrousd),
      providerEstimatedCostMicrousd: reservedMicrousd,
      sourceRef: `free_trial_lease_expired:${row.user_id}:${row.request_id}`,
      taskOutcome: 'undelivered',
      taskRef: row.request_id,
      usage: { type: 'free_trial_lease_expired', reservedMicrousd },
      db,
    });
  }
  return { released: rows.length, absorbedMicrousd };
}

function getRollingResetAt(oldestAt: string | Date | null, windowHours: number): string | null {
  return rollingResetAt(toIsoTimestamp(oldestAt), windowHours);
}

function nonNegativeMicrousd(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
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
