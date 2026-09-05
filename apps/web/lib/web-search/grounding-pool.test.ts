import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';

let store: KeyValueStore | null = null;
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () => store,
}));

import {
  GOOGLE_GROUNDING_MONTHLY_POOL_ENV,
  peekGroundingPool,
  reserveGroundingPoolUses,
  resolveGoogleGroundingMonthlyPool,
} from './grounding-pool';

const NOW = new Date(Date.UTC(2026, 8, 5, 12, 0));

describe('resolveGoogleGroundingMonthlyPool', () => {
  const previous = process.env[GOOGLE_GROUNDING_MONTHLY_POOL_ENV];

  afterEach(() => {
    if (previous === undefined) delete process.env[GOOGLE_GROUNDING_MONTHLY_POOL_ENV];
    else process.env[GOOGLE_GROUNDING_MONTHLY_POOL_ENV] = previous;
  });

  it('defaults to 5000', () => {
    delete process.env[GOOGLE_GROUNDING_MONTHLY_POOL_ENV];
    expect(resolveGoogleGroundingMonthlyPool()).toBe(5000);
  });

  it('honours a configured pool size', () => {
    process.env[GOOGLE_GROUNDING_MONTHLY_POOL_ENV] = '2000';
    expect(resolveGoogleGroundingMonthlyPool()).toBe(2000);
  });
});

describe('peekGroundingPool', () => {
  afterEach(() => {
    store = null;
  });

  it('fails open when no key-value backend is configured', async () => {
    store = null;
    expect(await peekGroundingPool('google', NOW)).toEqual({
      used: 0,
      limit: 5000,
      withinPool: true,
    });
  });

  it('reports the month-to-date count against the pool', async () => {
    store = createMemoryKeyValueStore();
    await reserveGroundingPoolUses('google', 4990, NOW);
    expect(await peekGroundingPool('google', NOW)).toEqual({
      used: 4990,
      limit: 5000,
      withinPool: true,
    });
  });

  it('reports the pool as spent once used reaches the limit', async () => {
    store = createMemoryKeyValueStore();
    await reserveGroundingPoolUses('google', 5000, NOW);
    expect((await peekGroundingPool('google', NOW)).withinPool).toBe(false);
  });
});

describe('reserveGroundingPoolUses', () => {
  afterEach(() => {
    store = null;
  });

  it('does nothing without a key-value backend', async () => {
    store = null;
    expect(await reserveGroundingPoolUses('google', 10, NOW)).toEqual({
      before: 0,
      after: 0,
      billableCalls: 0,
    });
  });

  it('bills nothing while entirely inside the pool', async () => {
    store = createMemoryKeyValueStore();
    const reservation = await reserveGroundingPoolUses('google', 100, NOW);
    expect(reservation).toEqual({ before: 0, after: 100, billableCalls: 0 });
  });

  it('splits a reservation that crosses the pool boundary', async () => {
    store = createMemoryKeyValueStore();
    await reserveGroundingPoolUses('google', 4990, NOW);
    const reservation = await reserveGroundingPoolUses('google', 20, NOW);
    expect(reservation).toEqual({ before: 4990, after: 5010, billableCalls: 10 });
  });

  it('bills every call once the pool is already spent', async () => {
    store = createMemoryKeyValueStore();
    await reserveGroundingPoolUses('google', 5000, NOW);
    const reservation = await reserveGroundingPoolUses('google', 5, NOW);
    expect(reservation).toEqual({ before: 5000, after: 5005, billableCalls: 5 });
  });

  it('keys the counter to the calendar month in UTC, separately per provider', async () => {
    store = createMemoryKeyValueStore();
    await reserveGroundingPoolUses('google', 10, NOW);
    const nextMonth = new Date(Date.UTC(2026, 9, 1, 0, 0));
    expect(await peekGroundingPool('google', nextMonth)).toEqual({
      used: 0,
      limit: 5000,
      withinPool: true,
    });
    expect(await peekGroundingPool('anthropic', NOW)).toEqual({
      used: 0,
      limit: 5000,
      withinPool: true,
    });
  });
});
