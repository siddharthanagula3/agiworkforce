import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { logger } from '@/lib/logger';
import type { SubscriptionInfo } from '@/lib/services/subscription-service';
import { getModelMetadataById } from '@agiworkforce/types';
export { FREE_TRIAL_MODEL, FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { eventAllowsModel } from '@/lib/server/event-access';
import {
  reserveEventSpend,
  settleEventSpend,
  type EventBudgetReservation,
} from '@/lib/server/event-budget';
import {
  getInternalUsageUnitMicrousd,
  getPlanFiveHourUsageBudgetMicrousd,
  getPlanMonthlyUsageBudgetMicrousd,
  getPlanWeeklyUsageBudgetMicrousd,
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
  unmetered?: true;
  /**
   * Present only for a turn served by an event-promoted model, which spends the
   * global event ceiling. Permanently free models carry none: their cost
   * predates the event and is not charged to it.
   */
  eventBudget?: EventBudgetReservation;
};

type FreeTrialSettlementOutcome = 'completed' | 'failed' | 'cancelled';

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
  monthlyUsedMicrousd: number;
  weeklyUsedMicrousd: number;
  fiveHourUsedMicrousd: number;
};

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
  if (requestedMaxOutputTokens === 0) {
    return { ok: false, code: 'budget_reached' };
  }
  if (input.reservation.unmetered && !input.reservation.eventBudget) {
    return { ok: true, maxOutputTokens: requestedMaxOutputTokens };
  }
  if (input.reservation.reservedMicrousd <= 0) return { ok: false, code: 'budget_reached' };

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

/**
 * Whether this request is served through Free access.
 *
 * An active event promotion answers yes for the models it covers. The
 * promotion widens which models a Free account may name and remains bounded by
 * its shared event ceiling; permanently free models have no account meter.
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

export async function getFreeTrialPublicUsage(
  _db: DatabaseAdapter,
  _userId: string,
): Promise<FreeTrialPublicUsage> {
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

export async function beginFreeTrialRequest(params: {
  userId: string;
  requestId: string;
  /** The requested model is selectable only because the event promotes it. */
  eventPromoted?: boolean;
}): Promise<ReserveResult> {
  const reservation: FreeTrialReservation = {
    kind: 'free_trial',
    userId: params.userId,
    requestId: params.requestId,
    reservedMicrousd: Number.MAX_SAFE_INTEGER,
    unmetered: true,
  };

  if (params.eventPromoted !== true) return { ok: true, reservation };

  // Event-only models remain bounded by the shared promotion ceiling even
  // though Free accounts no longer carry individual usage allowances.
  const eventReservationMicrousd = FREE_TRIAL_INTERNAL_USAGE_POLICY.monthlyBudgetMicrousd;
  const eventBudget = await reserveEventSpend(eventReservationMicrousd);
  if (!eventBudget) {
    return { ok: false, code: 'budget_reached' };
  }

  return {
    ok: true,
    reservation: { ...reservation, reservedMicrousd: eventReservationMicrousd, eventBudget },
  };
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
  if (params.reservation.unmetered) {
    if (params.reservation.eventBudget) {
      await settleEventSpend(
        params.reservation.eventBudget,
        params.outcome === 'completed' ? measuredCostMicrousd : 0,
      );
    }
    return;
  }
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
