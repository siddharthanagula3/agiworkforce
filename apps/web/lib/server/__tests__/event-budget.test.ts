import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = {
  value: 0,
  reachable: true,
  async increment(_key: string, amount = 1): Promise<number> {
    if (!this.reachable) throw new Error('key-value store unreachable');
    this.value += amount;
    return this.value;
  },
  async expire(): Promise<void> {},
  async get<T>(): Promise<T | null> {
    if (!this.reachable) throw new Error('key-value store unreachable');
    return this.value as T;
  },
};

let storePresent = true;

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () => (storePresent ? store : null),
}));

import {
  EVENT_BUDGET_USD_ENV,
  readEventBudgetState,
  reserveEventSpend,
  settleEventSpend,
} from '@/lib/server/event-budget';

const USD = 1_000_000;

describe('global event budget', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[EVENT_BUDGET_USD_ENV];
    store.value = 0;
    store.reachable = true;
    storePresent = true;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[EVENT_BUDGET_USD_ENV];
    else process.env[EVENT_BUDGET_USD_ENV] = saved;
  });

  it('does not invent a ceiling nobody configured', async () => {
    delete process.env[EVENT_BUDGET_USD_ENV];

    await expect(reserveEventSpend(50 * USD)).resolves.not.toBeNull();
    expect(store.value).toBe(0);
    expect(await readEventBudgetState()).toEqual({ kind: 'unlimited' });
  });

  it('admits spend up to the ceiling', async () => {
    process.env[EVENT_BUDGET_USD_ENV] = '10';

    expect(await reserveEventSpend(6 * USD)).not.toBeNull();
    expect(await reserveEventSpend(4 * USD)).not.toBeNull();
  });

  it('refuses the request that would cross the ceiling', async () => {
    process.env[EVENT_BUDGET_USD_ENV] = '10';

    expect(await reserveEventSpend(10 * USD)).not.toBeNull();
    expect(await reserveEventSpend(1)).toBeNull();
  });

  it('gives back the headroom a refused request took', async () => {
    process.env[EVENT_BUDGET_USD_ENV] = '10';
    await reserveEventSpend(9 * USD);

    expect(await reserveEventSpend(5 * USD)).toBeNull();

    // The refusal must not leave the budget looking spent: a smaller request
    // that still fits has to be admitted afterwards.
    expect(await reserveEventSpend(1 * USD)).not.toBeNull();
  });

  /**
   * The reservation is the user's whole remaining window, and a turn spends a
   * fraction of it. Without the refund the ceiling would be reached at a small
   * fraction of the money actually spent.
   */
  it('returns the unspent remainder at settlement', async () => {
    process.env[EVENT_BUDGET_USD_ENV] = '10';
    const reservation = await reserveEventSpend(5 * USD);
    expect(reservation).not.toBeNull();

    await settleEventSpend(reservation!, USD / 100);

    const state = await readEventBudgetState();
    expect(state).toMatchObject({ kind: 'available', spentMicrousd: USD / 100 });
  });

  it('never refunds more than was reserved', async () => {
    process.env[EVENT_BUDGET_USD_ENV] = '10';
    const reservation = await reserveEventSpend(1 * USD);

    await settleEventSpend(reservation!, 9 * USD);

    expect(store.value).toBe(1 * USD);
  });

  it('holds the line under concurrent requests', async () => {
    process.env[EVENT_BUDGET_USD_ENV] = '10';

    const results = await Promise.all(Array.from({ length: 40 }, () => reserveEventSpend(1 * USD)));

    expect(results.filter((r) => r !== null)).toHaveLength(10);
    expect(store.value).toBe(10 * USD);
  });

  /**
   * A cost guard that cannot measure must not authorise. Event models stop;
   * permanently free models and every paid plan are untouched, because neither
   * reaches this counter.
   */
  it('refuses rather than guesses when the counter is absent', async () => {
    process.env[EVENT_BUDGET_USD_ENV] = '10';
    storePresent = false;

    expect(await reserveEventSpend(1 * USD)).toBeNull();
    expect(await readEventBudgetState()).toEqual({ kind: 'unknown' });
  });

  it('refuses rather than guesses when the counter errors', async () => {
    process.env[EVENT_BUDGET_USD_ENV] = '10';
    store.reachable = false;

    expect(await reserveEventSpend(1 * USD)).toBeNull();
  });

  it('reports exhaustion for operator visibility', async () => {
    process.env[EVENT_BUDGET_USD_ENV] = '10';
    await reserveEventSpend(10 * USD);

    expect(await readEventBudgetState()).toMatchObject({ kind: 'exhausted' });
  });

  it('ignores a ceiling that is not a number', async () => {
    process.env[EVENT_BUDGET_USD_ENV] = 'lots';

    expect(await readEventBudgetState()).toEqual({ kind: 'unlimited' });
  });
});
