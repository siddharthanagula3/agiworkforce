// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore } from '@agiworkforce/key-value';
import { FREE_QUOTA_CHAT_DAILY_USE_KIND } from '@agiworkforce/cloud-contracts';
import {
  readFreeQuotaDailyUse,
  releaseFreeQuotaDailyUse,
  reserveFreeQuotaDailyUse,
  settleFreeQuotaDailyUse,
} from './free-quota-authorization';

const NOON = Date.UTC(2026, 9, 4, 12);
const CAP = 30_000;
const share = { userId: 'fixture-user', category: FREE_QUOTA_CHAT_DAILY_USE_KIND, nowMs: NOON };

describe("an account's daily share of free chat, counted in tokens", () => {
  it('reserves the units of a turn, not one request, under a key that never holds the account id', async () => {
    const store = createMemoryKeyValueStore();

    const reservation = await reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 5_120 });

    expect(reservation).toMatchObject({ units: 5_120 });
    expect(reservation!.key).toContain(':daily:chat:');
    expect(reservation!.key).not.toContain(share.userId);
    expect(await readFreeQuotaDailyUse(store, share)).toBe(5_120);
  });

  it('rounds a fractional estimate up, as the model allowance does', async () => {
    const store = createMemoryKeyValueStore();

    expect(
      await reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 10.2 }),
    ).toMatchObject({ units: 11 });
  });

  it('refuses a turn that would pass the share and leaves the count as it was', async () => {
    const store = createMemoryKeyValueStore();
    await reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 29_000 });

    expect(await reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 1_001 })).toBeNull();
    expect(await readFreeQuotaDailyUse(store, share)).toBe(29_000);
    expect(
      await reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 1_000 }),
    ).not.toBeNull();
  });

  it('settles a reservation to what the provider reported, down or up', async () => {
    const store = createMemoryKeyValueStore();
    const first = await reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 5_000 });
    await settleFreeQuotaDailyUse(store, first!, 1_234.4);
    expect(await readFreeQuotaDailyUse(store, share)).toBe(1_235);

    const second = await reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 2_000 });
    await settleFreeQuotaDailyUse(store, second!, 2_600);
    expect(await readFreeQuotaDailyUse(store, share)).toBe(1_235 + 2_600);
  });

  it('leaves the reservation alone when the reported total is not a number', async () => {
    const store = createMemoryKeyValueStore();
    const reservation = await reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 5_000 });

    await settleFreeQuotaDailyUse(store, reservation!, Number.NaN);

    expect(await readFreeQuotaDailyUse(store, share)).toBe(5_000);
  });

  it('gives back exactly what a turn reserved', async () => {
    const store = createMemoryKeyValueStore();
    await reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 700 });
    const reservation = await reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 5_000 });

    await releaseFreeQuotaDailyUse(store, reservation!);

    expect(await readFreeQuotaDailyUse(store, share)).toBe(700);
  });

  it('gives the units back when the expiry cannot be set, so a count never outlives its day', async () => {
    const store = createMemoryKeyValueStore();
    vi.spyOn(store, 'expire').mockRejectedValueOnce(new Error('store unreachable'));

    await expect(
      reserveFreeQuotaDailyUse(store, { ...share, cap: CAP, units: 5_000 }),
    ).rejects.toThrow('store unreachable');
    expect(await readFreeQuotaDailyUse(store, share)).toBe(0);
  });
});
