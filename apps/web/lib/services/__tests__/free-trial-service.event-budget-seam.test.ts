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

import {
  beginFreeTrialRequest,
  settleFreeTrialRequest,
} from '@/lib/services/free-trial-service';

/**
 * The seam between unmetered Free accounts and the global event ceiling.
 *
 * Permanently free models have no account ledger. A model exposed only by a
 * promotion still reserves and settles the promotion's shared budget.
 */
describe('the event ceiling remains shared while Free accounts are unmetered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.execute.mockResolvedValue(1);
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    );
    budget.settleEventSpend.mockResolvedValue(undefined);
  });

  it('does not touch the event ceiling for a permanently free model', async () => {
    const result = await beginFreeTrialRequest({ userId: 'user-1', requestId: 'r1' });

    expect(result.ok).toBe(true);
    expect(budget.reserveEventSpend).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('charges the event ceiling for a model only the promotion reaches', async () => {
    budget.reserveEventSpend.mockResolvedValue({ reservedMicrousd: 100_000 });

    const result = await beginFreeTrialRequest({
      userId: 'user-1',
      requestId: 'r2',
      eventPromoted: true,
    });

    expect(result.ok).toBe(true);
    expect(budget.reserveEventSpend).toHaveBeenCalledWith(100_000);
    if (result.ok) expect(result.reservation.eventBudget).toEqual({ reservedMicrousd: 100_000 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses an event-only model when its shared ceiling is exhausted', async () => {
    budget.reserveEventSpend.mockResolvedValue(null);

    const result = await beginFreeTrialRequest({
      userId: 'user-1',
      requestId: 'r4',
      eventPromoted: true,
    });

    expect(result).toEqual({ ok: false, code: 'budget_reached' });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('settles event spend without writing an account usage ledger', async () => {
    const eventBudget = { reservedMicrousd: 100_000 };

    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'r4',
        reservedMicrousd: 100_000,
        unmetered: true,
        eventBudget,
      },
      outcome: 'completed',
      measuredCostDollars: 0.025,
    });

    expect(budget.settleEventSpend).toHaveBeenCalledWith(eventBudget, 25_000);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
