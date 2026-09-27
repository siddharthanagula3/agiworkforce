import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chargeMicrousdForProviderCost } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const tx = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
const db = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
const budget = vi.hoisted(() => ({
  reserveEventSpend: vi.fn(),
  settleEventSpend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => db }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/event-budget', () => budget);

import {
  beginFreeTrialRequest,
  settleFreeTrialRequest,
} from '@/lib/services/free-trial-service';

const EMPTY_WINDOWS = {
  five_hour_used_microusd: '0',
  weekly_used_microusd: '0',
  monthly_used_microusd: '0',
  five_hour_oldest_at: null,
  weekly_oldest_at: null,
  account_period_end: '2026-10-20T00:00:00.000Z',
};

const BEGIN = {
  userId: 'user-1',
  leaseSeconds: 300,
  provider: 'openrouter',
  model: 'event-model',
  estimatedMicrousd: 4_321,
};

let reservationRow: Record<string, unknown> | null = null;

function reservationInserts(): unknown[][] {
  return tx.execute.mock.calls.filter(([sql]) =>
    String(sql).includes('insert into public.free_daily_usage_reservations'),
  ) as unknown[][];
}

function settlementWrites(): unknown[][] {
  return tx.execute.mock.calls.filter(([sql]) =>
    String(sql).includes('update public.free_daily_usage_reservations'),
  ) as unknown[][];
}

describe('the global event ceiling beside the metered Free windows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reservationRow = null;
    tx.execute.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('insert into public.free_daily_usage_reservations')) {
        reservationRow = {
          window_started_at: '2026-09-27T10:00:00.000Z',
          reserved_microusd: params[2],
          settled_at: null,
        };
      }
      return 1;
    });
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.website_auto_economy_trial_usage')) {
        return [{ user_id: 'user-1' }];
      }
      if (sql.includes('with account_anchor')) return [EMPTY_WINDOWS];
      if (sql.includes('from public.free_daily_usage_reservations')) {
        return reservationRow ? [reservationRow] : [];
      }
      return [];
    });
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    );
    budget.settleEventSpend.mockResolvedValue(undefined);
  });

  it('meters a permanently free model on the Free windows without touching the event ceiling', async () => {
    const result = await beginFreeTrialRequest({ ...BEGIN, requestId: 'r1' });

    expect(result).toEqual({
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'r1',
        reservedMicrousd: chargeMicrousdForProviderCost(BEGIN.estimatedMicrousd),
      },
    });
    expect(reservationInserts()).toHaveLength(1);
    expect(budget.reserveEventSpend).not.toHaveBeenCalled();
  });

  it('charges the event ceiling for exactly what the Free windows reserved', async () => {
    const reserved = chargeMicrousdForProviderCost(BEGIN.estimatedMicrousd);
    budget.reserveEventSpend.mockResolvedValue({ reservedMicrousd: reserved });

    const result = await beginFreeTrialRequest({
      ...BEGIN,
      requestId: 'r2',
      eventPromoted: true,
    });

    expect(result.ok).toBe(true);
    expect(budget.reserveEventSpend).toHaveBeenCalledWith(reserved);
    if (result.ok) expect(result.reservation.eventBudget).toEqual({ reservedMicrousd: reserved });
  });

  it('refuses an event-only model when the shared ceiling is spent and gives the window back', async () => {
    budget.reserveEventSpend.mockResolvedValue(null);

    const result = await beginFreeTrialRequest({
      ...BEGIN,
      requestId: 'r3',
      eventPromoted: true,
    });

    expect(result).toEqual({ ok: false, code: 'budget_reached', resetAt: null });
    const [release] = settlementWrites();
    expect(release?.[1]).toEqual(['user-1', 'r3', 0, 'failed', expect.any(String)]);
  });

  it('never asks the event ceiling for a turn the Free windows refused', async () => {
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.website_auto_economy_trial_usage')) {
        return [{ user_id: 'user-1' }];
      }
      if (sql.includes('with account_anchor')) {
        return [{ ...EMPTY_WINDOWS, five_hour_used_microusd: '10000' }];
      }
      return [];
    });

    const result = await beginFreeTrialRequest({
      ...BEGIN,
      requestId: 'r4',
      eventPromoted: true,
    });

    expect(result.ok).toBe(false);
    expect(budget.reserveEventSpend).not.toHaveBeenCalled();
    expect(reservationInserts()).toHaveLength(0);
  });

  it('hands the unspent remainder back to the event ceiling once, from the call that settled', async () => {
    const eventBudget = { reservedMicrousd: 100_000 };
    reservationRow = {
      window_started_at: '2026-09-27T10:00:00.000Z',
      reserved_microusd: 100_000,
      settled_at: null,
    };

    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'r5',
        reservedMicrousd: 100_000,
        eventBudget,
      },
      outcome: 'completed',
      cost: { tokenMicrousd: 24_990, toolMicrousd: 0 },
    });

    expect(budget.settleEventSpend).toHaveBeenCalledWith(
      eventBudget,
      chargeMicrousdForProviderCost(24_990),
    );

    budget.settleEventSpend.mockClear();
    reservationRow = { ...reservationRow, settled_at: '2026-09-27T10:05:00.000Z' };
    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'r5',
        reservedMicrousd: 100_000,
        eventBudget,
      },
      outcome: 'completed',
      cost: { tokenMicrousd: 24_990, toolMicrousd: 0 },
    });
    expect(budget.settleEventSpend).not.toHaveBeenCalled();
  });

  it('keeps the event reservation standing when the settlement could not be written', async () => {
    db.transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'r6',
        reservedMicrousd: 100_000,
        eventBudget: { reservedMicrousd: 100_000 },
      },
      outcome: 'completed',
      cost: { tokenMicrousd: 1_000, toolMicrousd: 0 },
    });

    expect(budget.settleEventSpend).not.toHaveBeenCalled();
  });
});
