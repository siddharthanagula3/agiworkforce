import 'server-only';

import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';

/**
 * The global event spend ceiling: one number covering everybody, as opposed to
 * the per-user windows that already bound each individual account.
 *
 * The four event ceilings are deliberately four separate controls, because they
 * fail for different reasons and an operator needs to reach for exactly one:
 *
 *   per user      the existing free rolling windows (5h / week / month), which
 *                 event traffic already reserves against because the promotion
 *                 routes through `isFreeTrialRequest`. Bounds one runaway account.
 *   global        THIS module. Bounds the whole event, including the case every
 *                 per-user ceiling is respected and there are simply far more
 *                 users than expected. Nothing else bounds that.
 *   per model     `AGI_EVENT_DISABLED_MODELS`. Bounds one model that turns out
 *                 to be expensive, broken or embarrassing.
 *   per provider  `AGI_EVENT_DISABLED_PROVIDERS`. Bounds one supplier that is
 *                 down, throttling or over its own budget.
 *
 * None of them substitutes for another, and no single number could: 10,000
 * users each respecting a $0.10 monthly ceiling is $1,000 of entirely
 * legitimate per-user-compliant spend.
 *
 * Why the key-value store rather than Postgres: free traffic never reaches
 * `provider_cost_events`, so there is no table that already sums event spend,
 * and adding one needs a migration this event cannot wait for. The counter is
 * reserve-then-settle like the per-user ledger, so concurrent requests cannot
 * each see the same headroom and spend it. It is an operational cost guard, not
 * an accounting record: `free_daily_usage_reservations` remains the ledger.
 */

export const EVENT_BUDGET_USD_ENV = 'AGI_EVENT_GLOBAL_BUDGET_USD';

const MICROUSD_PER_USD = 1_000_000;
const BUDGET_KEY = 'agi-event:spend-microusd';
/**
 * Outlives any plausible event, so the counter cannot silently reset mid-event
 * and hand out the budget a second time. An operator ending one event and
 * starting another deletes the key deliberately.
 */
const BUDGET_TTL_SECONDS = 30 * 24 * 60 * 60;

export type EventBudgetState =
  | { kind: 'unlimited' }
  | { kind: 'available'; spentMicrousd: number; limitMicrousd: number }
  | { kind: 'exhausted'; spentMicrousd: number; limitMicrousd: number }
  | { kind: 'unknown' };

export interface EventBudgetReservation {
  reservedMicrousd: number;
}

/**
 * Absent means no global ceiling, which is the correct default for a control
 * that did not exist yesterday: turning the event on must not silently acquire
 * a budget nobody chose. An operator running a public event sets it.
 */
export function readEventBudgetMicrousd(): number | null {
  const raw = process.env[EVENT_BUDGET_USD_ENV]?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed * MICROUSD_PER_USD);
}

function toCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

/**
 * Reserve headroom before the provider is called.
 *
 * Increment first, then compare, so two concurrent requests cannot both read
 * the same remaining balance and both spend it. A request that pushes the
 * counter past the limit gives its reservation straight back and is refused,
 * which is why the increment is safe to do speculatively.
 */
export async function reserveEventSpend(
  amountMicrousd: number,
): Promise<EventBudgetReservation | null> {
  const limitMicrousd = readEventBudgetMicrousd();
  if (limitMicrousd === null) return { reservedMicrousd: 0 };

  const amount = Math.max(0, Math.trunc(amountMicrousd));
  const store = getKeyValueStore();
  if (!store) {
    // No counter means no way to know whether the ceiling is already spent. A
    // cost guard that cannot measure must not authorise: the event pauses,
    // permanently free models keep working, and paid traffic is untouched.
    logger.warn({ limitMicrousd }, 'event budget cannot be measured; refusing event spend');
    return null;
  }

  try {
    const spent = toCount(await store.increment(BUDGET_KEY, amount));
    await store.expire(BUDGET_KEY, BUDGET_TTL_SECONDS);
    if (spent > limitMicrousd) {
      await store.increment(BUDGET_KEY, -amount);
      logger.warn({ spent, limitMicrousd }, 'global event budget is exhausted');
      return null;
    }
    return { reservedMicrousd: amount };
  } catch (error) {
    logger.warn({ error }, 'event budget reservation failed; refusing event spend');
    return null;
  }
}

/**
 * Return the unspent remainder once the real cost is known. Reservations are
 * sized from the per-user headroom, so most turns hand back the large majority
 * of what they took; without this the ceiling would be reached long before the
 * money was actually spent.
 */
export async function settleEventSpend(
  reservation: EventBudgetReservation,
  actualMicrousd: number,
): Promise<void> {
  if (reservation.reservedMicrousd <= 0) return;
  const actual = Math.max(0, Math.trunc(actualMicrousd));
  const refund = reservation.reservedMicrousd - Math.min(actual, reservation.reservedMicrousd);
  if (refund <= 0) return;

  const store = getKeyValueStore();
  if (!store) return;
  try {
    await store.increment(BUDGET_KEY, -refund);
  } catch (error) {
    // Losing a refund overstates spend, which ends the event early. That is the
    // safe direction to fail, so it is logged rather than retried.
    logger.warn({ error, refund }, 'event budget refund was not recorded');
  }
}

/** Read-only, for operator visibility and the event badge. Never authorises. */
export async function readEventBudgetState(): Promise<EventBudgetState> {
  const limitMicrousd = readEventBudgetMicrousd();
  if (limitMicrousd === null) return { kind: 'unlimited' };

  const store = getKeyValueStore();
  if (!store) return { kind: 'unknown' };
  try {
    const spentMicrousd = toCount(await store.get(BUDGET_KEY));
    return spentMicrousd >= limitMicrousd
      ? { kind: 'exhausted', spentMicrousd, limitMicrousd }
      : { kind: 'available', spentMicrousd, limitMicrousd };
  } catch {
    return { kind: 'unknown' };
  }
}
