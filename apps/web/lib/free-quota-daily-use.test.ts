// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore } from '@agiworkforce/key-value';
import {
  freeQuotaDayResetsAtMs,
  readFreeQuotaDailyUse,
  releaseFreeQuotaDailyUse,
  reserveFreeQuotaDailyUse,
} from './free-quota-authorization';

const NOON = Date.UTC(2026, 8, 19, 12);
const MIDNIGHT = Date.UTC(2026, 8, 20);
const USER = 'fixture-user';

function use(category: 'image' | 'video', nowMs = NOON, userId = USER) {
  return { userId, category, nowMs };
}

describe('the per-account daily use of the limited free media offer', () => {
  it('resets at the next UTC midnight, whatever the hour', () => {
    expect(freeQuotaDayResetsAtMs(NOON)).toBe(MIDNIGHT);
    expect(freeQuotaDayResetsAtMs(MIDNIGHT - 1)).toBe(MIDNIGHT);
    expect(freeQuotaDayResetsAtMs(MIDNIGHT)).toBe(MIDNIGHT + 86_400_000);
  });

  it('admits requests up to the cap and refuses the next without counting it', async () => {
    const store = createMemoryKeyValueStore();
    const cap = 3;

    for (let request = 1; request <= cap; request += 1) {
      expect(await reserveFreeQuotaDailyUse(store, { ...use('image'), cap })).not.toBeNull();
    }
    expect(await reserveFreeQuotaDailyUse(store, { ...use('image'), cap })).toBeNull();
    expect(await readFreeQuotaDailyUse(store, use('image'))).toBe(cap);
  });

  it('starts again on the next UTC day', async () => {
    const store = createMemoryKeyValueStore();
    await reserveFreeQuotaDailyUse(store, { ...use('video'), cap: 1 });

    expect(
      await reserveFreeQuotaDailyUse(store, { ...use('video', MIDNIGHT - 1), cap: 1 }),
    ).toBeNull();
    expect(await readFreeQuotaDailyUse(store, use('video', MIDNIGHT))).toBe(0);
    expect(
      await reserveFreeQuotaDailyUse(store, { ...use('video', MIDNIGHT), cap: 1 }),
    ).not.toBeNull();
  });

  it('gives a reserved request back', async () => {
    const store = createMemoryKeyValueStore();
    const reservation = await reserveFreeQuotaDailyUse(store, { ...use('video'), cap: 1 });

    await releaseFreeQuotaDailyUse(store, reservation!);

    expect(await readFreeQuotaDailyUse(store, use('video'))).toBe(0);
    expect(await reserveFreeQuotaDailyUse(store, { ...use('video'), cap: 1 })).not.toBeNull();
  });

  it('counts images apart from video and one account apart from another', async () => {
    const store = createMemoryKeyValueStore();
    await reserveFreeQuotaDailyUse(store, { ...use('image'), cap: 1 });

    expect(await readFreeQuotaDailyUse(store, use('video'))).toBe(0);
    expect(await readFreeQuotaDailyUse(store, use('image', NOON, 'another-user'))).toBe(0);
    expect(
      await reserveFreeQuotaDailyUse(store, { ...use('image', NOON, 'another-user'), cap: 1 }),
    ).not.toBeNull();
  });

  it('keeps the count only until the day has passed and never stores the account id', async () => {
    const store = createMemoryKeyValueStore();
    const expire = vi.spyOn(store, 'expire');

    const reservation = await reserveFreeQuotaDailyUse(store, { ...use('image'), cap: 5 });

    const [key, ttlSeconds] = expire.mock.calls[0]!;
    expect(key).toBe(reservation!.key);
    expect(key).not.toContain(USER);
    expect(ttlSeconds).toBeGreaterThanOrEqual((MIDNIGHT - NOON) / 1_000);
    expect(ttlSeconds).toBeLessThan(86_400);
  });

  it('gives the request back when its expiry cannot be set, so a count never outlives its day', async () => {
    const store = createMemoryKeyValueStore();
    vi.spyOn(store, 'expire').mockRejectedValueOnce(new Error('store unreachable'));

    await expect(reserveFreeQuotaDailyUse(store, { ...use('image'), cap: 5 })).rejects.toThrow(
      'store unreachable',
    );

    expect(await readFreeQuotaDailyUse(store, use('image'))).toBe(0);
  });

  it('reads an unreadable count as over any cap', async () => {
    const store = createMemoryKeyValueStore();
    vi.spyOn(store, 'get').mockResolvedValueOnce('not-a-number');

    expect(await readFreeQuotaDailyUse(store, use('image'))).toBe(Number.POSITIVE_INFINITY);
  });
});
