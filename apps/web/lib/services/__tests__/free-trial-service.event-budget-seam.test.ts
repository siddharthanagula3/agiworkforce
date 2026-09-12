import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { beginFreeTrialRequest } from '@/lib/services/free-trial-service';

/**
 * The seam between the per-user free windows and the global event ceiling.
 *
 * Each half is covered on its own. What is not obvious, and what this pins, is
 * the order and the unwind: the global ceiling is taken LAST, outside the
 * transaction, because it is a key-value counter and holding the hot per-user
 * row lock across a network call to it would serialise the whole event. That
 * ordering is only safe if a refusal by the global ceiling gives the per-user
 * reservation back. Without the unwind an event that has run out of money would
 * quietly eat each visitor's free allowance on the way to refusing them.
 */
const SNAPSHOT = {
  five_hour_used_microusd: 0,
  weekly_used_microusd: 0,
  monthly_used_microusd: 0,
  five_hour_oldest_at: null,
  weekly_oldest_at: null,
  account_period_end: '2026-10-10T00:00:00.000Z',
};

function settledReservationRows() {
  // `for update` on the usage row, then the existing-reservation probe (none),
  // then the usage snapshot. `settleFreeTrialRequest` re-reads the reservation.
  tx.query
    .mockResolvedValueOnce([{ user_id: 'user-1' }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([SNAPSHOT])
    .mockResolvedValue([
      { window_started_at: new Date().toISOString(), reserved_microusd: 25_000, settled_at: null },
    ]);
}

describe('the event ceiling and the free window unwind together', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.execute.mockResolvedValue(1);
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    );
    budget.settleEventSpend.mockResolvedValue(undefined);
  });

  it('does not touch the event ceiling for a permanently free model', async () => {
    settledReservationRows();

    const result = await beginFreeTrialRequest({ userId: 'user-1', requestId: 'r1' });

    expect(result.ok).toBe(true);
    expect(budget.reserveEventSpend).not.toHaveBeenCalled();
  });

  it('charges the event ceiling for a model only the promotion reaches', async () => {
    settledReservationRows();
    budget.reserveEventSpend.mockResolvedValue({ reservedMicrousd: 25_000 });

    const result = await beginFreeTrialRequest({
      userId: 'user-1',
      requestId: 'r2',
      eventPromoted: true,
    });

    expect(result.ok).toBe(true);
    expect(budget.reserveEventSpend).toHaveBeenCalledTimes(1);
    if (result.ok) expect(result.reservation.eventBudget).toEqual({ reservedMicrousd: 25_000 });
  });

  it('reserves exactly what the user window granted, never a different number', async () => {
    settledReservationRows();
    budget.reserveEventSpend.mockResolvedValue({ reservedMicrousd: 25_000 });

    const result = await beginFreeTrialRequest({
      userId: 'user-1',
      requestId: 'r3',
      eventPromoted: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(budget.reserveEventSpend).toHaveBeenCalledWith(result.reservation.reservedMicrousd);
    }
  });

  /** The unwind. Without it the event eats a visitor's allowance to refuse them. */
  it('gives the user their free allowance back when the event ceiling refuses', async () => {
    settledReservationRows();
    budget.reserveEventSpend.mockResolvedValue(null);

    const result = await beginFreeTrialRequest({
      userId: 'user-1',
      requestId: 'r4',
      eventPromoted: true,
    });

    expect(result).toEqual({ ok: false, code: 'budget_reached' });
    // The release is the settlement writing the reservation back as failed.
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringMatching(/free_daily_usage_reservations[\s\S]*settled_at = now\(\)/i),
      expect.arrayContaining(['failed']),
    );
  });

  it('refuses before any event spend when the user window is already empty', async () => {
    tx.query
      .mockResolvedValueOnce([{ user_id: 'user-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...SNAPSHOT,
          five_hour_used_microusd: 25_000,
          weekly_used_microusd: 75_000,
          monthly_used_microusd: 100_000,
        },
      ]);

    const result = await beginFreeTrialRequest({
      userId: 'user-1',
      requestId: 'r5',
      eventPromoted: true,
    });

    expect(result).toEqual({ ok: false, code: 'budget_reached' });
    expect(budget.reserveEventSpend).not.toHaveBeenCalled();
  });
});
