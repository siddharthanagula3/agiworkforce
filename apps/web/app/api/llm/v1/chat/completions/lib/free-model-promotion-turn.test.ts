import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryKeyValueStore,
  createSlidingWindowRateLimiter,
  type KeyValueStore,
} from '@agiworkforce/key-value';
import { getDefaultModelFor, type ModelMetadata } from '@agiworkforce/types';

type PromotionTestModule0 = typeof import('@/lib/logger');
type PromotionTestModule1 = typeof import('@agiworkforce/types');
type PromotionTestModule2 = typeof import('@/lib/services/provider-adapter-service');
type PromotionTestModule3 = typeof import('@/lib/server/free-quota-catalogue');
type PromotionTestModule4 = typeof import('@/lib/server/neon-db');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule0>()),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const shared = vi.hoisted(() => ({ store: null as KeyValueStore | null }));

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<PromotionTestModule1>();
  const promotionDocument = (await import('@/config/free-model-promotion.json')).default;
  const promoted = Object.values(actual.modelsById).find(
    (model: ModelMetadata) =>
      model.provider === promotionDocument.provider &&
      model.qualityTier === promotionDocument.modelFamilyTier &&
      model.deprecated !== true,
  );
  const families = Object.values(actual.MODEL_FAMILY_REGISTRY);
  const slotExists = families.some(
    (family) =>
      family.provider === promotionDocument.provider &&
      family.tier === promotionDocument.modelFamilyTier,
  );
  const [template] = families;
  return {
    ...actual,
    MODEL_FAMILY_REGISTRY:
      slotExists || !promoted || !template
        ? actual.MODEL_FAMILY_REGISTRY
        : {
            ...actual.MODEL_FAMILY_REGISTRY,
            'fixture/promoted': {
              ...template,
              provider: promotionDocument.provider,
              tier: promotionDocument.modelFamilyTier,
              activeModelId: promoted.id,
            },
          },
  };
});
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule2>()),
  listAvailableManagedProviderIds: () => new Set(['anthropic']),
}));
vi.mock('@/lib/server/free-quota-catalogue', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule3>()),
  sharedFreeQuotaStore: () => shared.store,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule4>()),
  getNeonDb: () => ({}),
}));

import { admitFreeModelPromotionTurn } from './free-model-promotion-turn';
import { loadFreeModelPromotionConfig } from '@/lib/server/free-model-promotion';
import type { FreeModelPromotionLedger } from '@/lib/server/free-model-promotion-ledger';

const config = loadFreeModelPromotionConfig();
const NOW = Date.parse(config.startsAt) + 3_600_000;
const isolatedEnv = (() => {
  const credential = config.credentials.find((candidate) => candidate.apiKey !== 'managed');
  return credential && credential.apiKey !== 'managed' ? credential.apiKey.env : '';
})();

function ledger(store: KeyValueStore): FreeModelPromotionLedger {
  return {
    store,
    limiter: createSlidingWindowRateLimiter(store, { now: () => NOW }),
    managedSpendMicrousd: async () => 0,
  };
}

function admit(overrides: Partial<Parameters<typeof admitFreeModelPromotionTurn>[0]> = {}) {
  return admitFreeModelPromotionTurn({
    userId: 'user-free',
    planTier: 'free',
    surface: 'web',
    selection: 'auto',
    messages: [{ role: 'user', content: 'hello' }],
    trainingOptOut: async () => false,
    region: null,
    nowMs: NOW,
    ledger: ledger(shared.store as KeyValueStore),
    ...overrides,
  });
}

async function promotionSpend(): Promise<number> {
  return Number(
    (await shared.store?.get<number>(`free-model-promotion:${config.promotionId}:spent`)) ?? 0,
  );
}

describe('admitting a turn to the free model promotion', () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    shared.store = createMemoryKeyValueStore({ now: () => NOW });
    savedKey = process.env[isolatedEnv];
    process.env[isolatedEnv] = 'promotion-account-key';
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[isolatedEnv];
    else process.env[isolatedEnv] = savedKey;
  });

  it('admits a signed-in Free account asking for Auto and holds one turn of spend', async () => {
    const turn = await admit();

    expect(turn?.promotion.promotionId).toBe(config.promotionId);
    expect(turn?.hold.reservation.isolated).toBe(true);
    expect(await promotionSpend()).toBe(turn?.promotion.turnReserveMicrousd);
  });

  it('leaves paid plans and signed-out traffic alone', async () => {
    expect(await admit({ planTier: 'pro' })).toBeNull();
    expect(await admit({ planTier: 'basic' })).toBeNull();
    expect(await admit({ planTier: null })).toBeNull();
    expect(await promotionSpend()).toBe(0);
  });

  it('leaves the developer API alone', async () => {
    expect(await admit({ surface: 'api' })).toBeNull();
  });

  it('leaves a model the account picked by name alone', async () => {
    expect(await admit({ selection: getDefaultModelFor('free', 'chat') })).toBeNull();
  });

  it('ends at the end date with no further reservations', async () => {
    expect(await admit({ nowMs: Date.parse(config.endsAt) })).toBeNull();
    expect(await promotionSpend()).toBe(0);
  });

  it('ends at the global spend ceiling', async () => {
    await shared.store?.increment(
      `free-model-promotion:${config.promotionId}:spent`,
      Math.round(config.spendCeilingUsd * 1_000_000),
    );

    expect(await admit()).toBeNull();
  });

  it('leaves a message too large to keep under the prompt ceiling on the normal route', async () => {
    expect(
      await admit({
        messages: [{ role: 'user', content: 'z'.repeat(config.latestMessageTokenLimit + 1) }],
      }),
    ).toBeNull();
    expect(await promotionSpend()).toBe(0);
  });

  it('returns the hold when the turn ends before it is handed over, and only once', async () => {
    const turn = await admit();
    if (!turn) throw new Error('expected an admitted turn');

    await turn.hold.releaseUnlessHandedOver();
    await turn.hold.releaseUnlessHandedOver();

    expect(await promotionSpend()).toBe(0);
  });

  it('keeps the hold once the Free reservation has taken it over', async () => {
    const turn = await admit();
    if (!turn) throw new Error('expected an admitted turn');

    turn.hold.handOver();
    await turn.hold.releaseUnlessHandedOver();

    expect(await promotionSpend()).toBe(turn.promotion.turnReserveMicrousd);
  });
});
