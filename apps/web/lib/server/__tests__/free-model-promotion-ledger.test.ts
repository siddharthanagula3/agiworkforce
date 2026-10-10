import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryKeyValueStore,
  createSlidingWindowRateLimiter,
  type KeyValueStore,
} from '@agiworkforce/key-value';

type PromotionTestModule0 = typeof import('@/lib/logger');
type PromotionTestModule1 = typeof import('@/lib/server/free-quota-catalogue');
type PromotionTestModule2 = typeof import('@/lib/server/key-value');
type PromotionTestModule3 = typeof import('@/lib/server/neon-db');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule0>()),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const shared = vi.hoisted(() => ({ store: null as KeyValueStore | null }));

vi.mock('@/lib/server/free-quota-catalogue', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule1>()),
  sharedFreeQuotaStore: () => shared.store,
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule2>()),
  getKeyValueRateLimiter: () => null,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule3>()),
  getNeonDb: () => ({}),
}));

import {
  endFreeModelPromotionCredential,
  freeModelPromotionHasCapacity,
  readManagedProviderSpendSince,
  reserveFreeModelPromotionTurn,
  settleFreeModelPromotionTurn,
  type FreeModelPromotionLedger,
} from '@/lib/server/free-model-promotion-ledger';
import type { FreeModelPromotion } from '@/lib/server/free-model-promotion';

const USD = 1_000_000;
const NOW = Date.parse('2026-10-12T12:00:00Z');

function promotion(patch: Partial<FreeModelPromotion> = {}): FreeModelPromotion {
  return {
    promotionId: 'test-promotion',
    provider: 'anthropic',
    modelId: 'promoted-model',
    startsAtMs: Date.parse('2026-10-10T00:00:00Z'),
    endsAtMs: Date.parse('2026-10-24T23:59:59Z'),
    spendCeilingMicrousd: 380 * USD,
    turnReserveMicrousd: 0.15 * USD,
    perUserMessages: { limit: 300, window: '5 h' },
    promptTokenCeiling: 100_000,
    promptBudgetTokens: 88_000,
    latestMessageTokenLimit: 40_000,
    imagePartTokenBound: 6_000,
    toolResultHistoryChars: 40_000,
    managedSpendRefreshMs: 60_000,
    outputTokenCap: 8_192,
    credentials: [
      { id: 'promotion-account', creditMicrousd: 200 * USD, isolated: true, apiKeyEnv: 'K' },
      { id: 'managed-account', creditMicrousd: 200 * USD, isolated: false, apiKeyEnv: null },
    ],
    ...patch,
  };
}

let clock = NOW;
let managedSpend: number | null = 0;

function ledger(store: KeyValueStore): FreeModelPromotionLedger {
  return {
    store,
    limiter: createSlidingWindowRateLimiter(store, { now: () => clock }),
    managedSpendMicrousd: async () => managedSpend,
  };
}

async function spent(store: KeyValueStore, key: string): Promise<number> {
  return Number((await store.get<number>(`free-model-promotion:test-promotion:${key}`)) ?? 0);
}

describe('free model promotion ledger', () => {
  let store: KeyValueStore;

  beforeEach(() => {
    clock = NOW;
    managedSpend = 0;
    store = createMemoryKeyValueStore({ now: () => clock });
    shared.store = store;
  });

  it('reserves on the promotion account first', async () => {
    const reservation = await reserveFreeModelPromotionTurn({
      promotion: promotion(),
      userId: 'u1',
      nowMs: NOW,
      ledger: ledger(store),
    });

    expect(reservation).toEqual({
      promotionId: 'test-promotion',
      credentialId: 'promotion-account',
      isolated: true,
      reservedMicrousd: 0.15 * USD,
    });
    expect(await spent(store, 'spent')).toBe(0.15 * USD);
    expect(await spent(store, 'credential:promotion-account:spent')).toBe(0.15 * USD);
  });

  it('moves to the managed account once the promotion account has spent its credit', async () => {
    await store.increment(
      'free-model-promotion:test-promotion:credential:promotion-account:spent',
      200 * USD - 0.1 * USD,
    );

    const reservation = await reserveFreeModelPromotionTurn({
      promotion: promotion(),
      userId: 'u1',
      nowMs: NOW,
      ledger: ledger(store),
    });

    expect(reservation?.credentialId).toBe('managed-account');
    expect(reservation?.isolated).toBe(false);
    expect(await spent(store, 'credential:promotion-account:spent')).toBe(200 * USD - 0.1 * USD);
  });

  it('gives the managed account only what managed traffic has left of its credit', async () => {
    const onlyManaged = promotion({ credentials: [promotion().credentials[1]!] });
    managedSpend = 199.9 * USD;

    const refused = await reserveFreeModelPromotionTurn({
      promotion: onlyManaged,
      userId: 'u1',
      nowMs: NOW,
      ledger: ledger(store),
    });
    managedSpend = 199.75 * USD;
    const first = await reserveFreeModelPromotionTurn({
      promotion: onlyManaged,
      userId: 'u1',
      nowMs: NOW,
      ledger: ledger(store),
    });
    const second = await reserveFreeModelPromotionTurn({
      promotion: onlyManaged,
      userId: 'u2',
      nowMs: NOW,
      ledger: ledger(store),
    });

    expect(refused).toBeNull();
    expect(first?.credentialId).toBe('managed-account');
    expect(second).toBeNull();
    expect(await spent(store, 'spent')).toBe(0.15 * USD);
  });

  it('never uses the managed account when its spend cannot be measured', async () => {
    managedSpend = null;

    const reservation = await reserveFreeModelPromotionTurn({
      promotion: promotion({ credentials: [promotion().credentials[1]!] }),
      userId: 'u1',
      nowMs: NOW,
      ledger: ledger(store),
    });

    expect(reservation).toBeNull();
  });

  it('stops at the global spend ceiling even while a credential has credit left', async () => {
    await store.increment('free-model-promotion:test-promotion:spent', 380 * USD - 0.1 * USD);

    const reservation = await reserveFreeModelPromotionTurn({
      promotion: promotion(),
      userId: 'u1',
      nowMs: NOW,
      ledger: ledger(store),
    });

    expect(reservation).toBeNull();
    expect(await spent(store, 'spent')).toBe(380 * USD - 0.1 * USD);
    expect(await spent(store, 'credential:promotion-account:spent')).toBe(0);
  });

  it('lets concurrent turns reserve no more than the ceiling allows', async () => {
    const tight = promotion({ spendCeilingMicrousd: 1.5 * USD });

    const results = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        reserveFreeModelPromotionTurn({
          promotion: tight,
          userId: `user-${index}`,
          nowMs: NOW,
          ledger: ledger(store),
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(10);
    expect(await spent(store, 'spent')).toBe(1.5 * USD);
  });

  it('skips a credential the provider ended and moves to the next', async () => {
    await endFreeModelPromotionCredential(
      { promotionId: 'test-promotion', credentialId: 'promotion-account' },
      promotion(),
      store,
      NOW,
    );

    const reservation = await reserveFreeModelPromotionTurn({
      promotion: promotion(),
      userId: 'u1',
      nowMs: NOW,
      ledger: ledger(store),
    });

    expect(reservation?.credentialId).toBe('managed-account');
  });

  it('ends the promotion for new turns once every credential is ended', async () => {
    for (const credentialId of ['promotion-account', 'managed-account']) {
      await endFreeModelPromotionCredential(
        { promotionId: 'test-promotion', credentialId },
        promotion(),
        store,
        NOW,
      );
    }

    expect(
      await reserveFreeModelPromotionTurn({
        promotion: promotion(),
        userId: 'u1',
        nowMs: NOW,
        ledger: ledger(store),
      }),
    ).toBeNull();
    expect(await freeModelPromotionHasCapacity(promotion(), NOW, ledger(store))).toBe(false);
  });

  it('caps one account at its message rate and gives the spend back, leaving other accounts served', async () => {
    const capped = promotion({ perUserMessages: { limit: 3, window: '5 h' } });
    const reserve = (userId: string) =>
      reserveFreeModelPromotionTurn({
        promotion: capped,
        userId,
        nowMs: clock,
        ledger: ledger(store),
      });

    const allowed = [await reserve('heavy'), await reserve('heavy'), await reserve('heavy')];
    const fourth = await reserve('heavy');
    const other = await reserve('light');

    expect(allowed.every(Boolean)).toBe(true);
    expect(fourth).toBeNull();
    expect(other).not.toBeNull();
    expect(await spent(store, 'spent')).toBe(4 * 0.15 * USD);

    clock = NOW + 5 * 60 * 60 * 1_000 + 1;
    expect(await reserve('heavy')).not.toBeNull();
  });

  it('settles a reservation to its measured cost on both counters', async () => {
    const reservation = await reserveFreeModelPromotionTurn({
      promotion: promotion(),
      userId: 'u1',
      nowMs: NOW,
      ledger: ledger(store),
    });
    if (!reservation) throw new Error('expected a reservation');

    await settleFreeModelPromotionTurn(reservation, 12_345, store);

    expect(await spent(store, 'spent')).toBe(12_345);
    expect(await spent(store, 'credential:promotion-account:spent')).toBe(12_345);
  });

  it('records a cost above the reservation rather than losing it', async () => {
    const reservation = await reserveFreeModelPromotionTurn({
      promotion: promotion(),
      userId: 'u1',
      nowMs: NOW,
      ledger: ledger(store),
    });
    if (!reservation) throw new Error('expected a reservation');

    await settleFreeModelPromotionTurn(reservation, 0.2 * USD, store);

    expect(await spent(store, 'spent')).toBe(0.2 * USD);
  });

  it('serves nothing without a shared store', async () => {
    expect(
      await reserveFreeModelPromotionTurn({
        promotion: promotion(),
        userId: 'u1',
        nowMs: NOW,
        ledger: null,
      }),
    ).toBeNull();
    expect(await freeModelPromotionHasCapacity(promotion(), NOW, null)).toBe(false);
  });

  it('reports capacity while a turn could still be reserved', async () => {
    expect(await freeModelPromotionHasCapacity(promotion(), NOW, ledger(store))).toBe(true);
    await store.increment('free-model-promotion:test-promotion:spent', 380 * USD);
    expect(await freeModelPromotionHasCapacity(promotion(), NOW, ledger(store))).toBe(false);
  });

  it('measures managed spend from the provider cost ledger and caches it', async () => {
    const query = vi.fn().mockResolvedValue([{ spent_microusd: '4200000' }]);
    const db = { query } as unknown as Parameters<typeof readManagedProviderSpendSince>[4];

    const first = await readManagedProviderSpendSince('anthropic', 1, 60_000, NOW, db);
    const cached = await readManagedProviderSpendSince('anthropic', 1, 60_000, NOW + 1_000, db);
    const refreshed = await readManagedProviderSpendSince('anthropic', 1, 60_000, NOW + 61_000, db);

    expect([first, cached, refreshed]).toEqual([4_200_000, 4_200_000, 4_200_000]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain('from public.provider_cost_events');
    expect(query.mock.calls[0]?.[1]?.[0]).toBe('anthropic');
  });

  it('cannot measure managed spend when the ledger read fails', async () => {
    const db = {
      query: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as Parameters<typeof readManagedProviderSpendSince>[4];

    expect(await readManagedProviderSpendSince('anthropic', 2, 60_000, NOW, db)).toBeNull();
  });
});
