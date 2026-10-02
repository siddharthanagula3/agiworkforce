// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import {
  credentialSha256,
  recordFreeQuotaSuspension,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';
type ScanModule0 = typeof import('@/lib/api-auth');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/server/rls-db');
type ScanModule3 = typeof import('@/lib/server/key-value');
type ScanModule4 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule5 = typeof import('@/lib/server/free-pools');
type ScanModule6 = typeof import('next/cache');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  user: { id: 'fixture-user-a', plan: 'free' },
}));

const cache = await vi.hoisted(async () => {
  const { createStaleWhileRevalidateCache } =
    await import('@/test/next-cache-stale-while-revalidate');
  return createStaleWhileRevalidateCache();
});

vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  unstable_cache: cache.unstable_cache,
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  assertAccountActive: async () => undefined,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: async () => null,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  getUserScopedDb: async () => ({ userId: mocks.user.id, organizationId: null, db: {} }),
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  resolveEntitledPlanTier: async () => mocks.user.plan,
}));
vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<ScanModule5>();
  return {
    ...actual,
    loadFreePools: () => {
      const document = actual.loadFreePools();
      const inventory = document.inventory!;
      return {
        ...document,
        inventory: {
          ...inventory,
          termsReview: {
            terms: {
              commercialUseAllowed: true,
              thirdPartyServingAllowed: true,
              proxyingAllowed: true,
              promptsExcludedFromTraining: true,
            },
            evidenceUrl: 'https://provider.example/terms',
            reviewedBy: 'fixture-reviewer',
            verifiedAtMs: Date.now() - 60_000,
            expiresAtMs: Date.now() + 86_400_000,
            approvedOfferingKeys: inventory.entries.map((entry) => entry.offeringKey),
          },
        },
      };
    },
  };
});

const { GET } = await import('./route');

const API_KEY = 'fixture-provider-key';

async function catalogueFor(
  user: { id: string; plan: string },
  url = 'https://agiworkforce.com/api/models/free-quota',
): Promise<FreeQuotaCatalogue> {
  mocks.user = user;
  const response = await GET(new NextRequest(url));
  expect(response.status).toBe(200);
  return response.json();
}

function ready(catalogue: FreeQuotaCatalogue): string[] {
  return catalogue.models.filter((model) => model.status === 'ready').map((model) => model.key);
}

const LIVE_WINDOW_MS = RENDER_CACHE_SECONDS.liveSignal * 1_000;

function failingBatch(store: MemoryKeyValueStore) {
  const batch = store.batch.bind(store);
  return () =>
    Object.assign(batch(), {
      exec: async (): Promise<unknown[]> => {
        throw new Error('fixture: the shared state store timed out');
      },
    });
}

function failNextSharedStateRead(store: MemoryKeyValueStore) {
  const fail = failingBatch(store);
  return vi.spyOn(store, 'batch').mockImplementationOnce(fail);
}

function failSharedStateReads(store: MemoryKeyValueStore) {
  const fail = failingBatch(store);
  return vi.spyOn(store, 'batch').mockImplementation(fail);
}

async function attestAllOfferings() {
  await writeQuotaAttestation(mocks.store, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
}

function passLiveWindow() {
  vi.setSystemTime(Date.now() + LIVE_WINDOW_MS + 1);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  cache.clear();
});

afterEach(() => vi.useRealTimers());

it('reads the shared quota state once for every account instead of once per request', async () => {
  const reads = vi.spyOn(mocks.store, 'batch');

  const free = await catalogueFor({ id: 'fixture-user-a', plan: 'free' });
  const otherFree = await catalogueFor({ id: 'fixture-user-b', plan: 'free' });
  const media = await catalogueFor({ id: 'fixture-user-c', plan: 'max_15x' });

  expect(reads).toHaveBeenCalledTimes(1);
  expect(otherFree).toEqual(free);
  expect(free.models.every((model) => model.category === 'chat')).toBe(true);
  expect(media.models.every((model) => ['image', 'video'].includes(model.category))).toBe(true);
});

it('reads fresh state for a local request checked against the developer attestation', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  const reads = vi.spyOn(mocks.store, 'batch');
  const local = 'http://localhost:3000/api/models/free-quota';

  await catalogueFor({ id: 'fixture-user-a', plan: 'free' }, local);
  await catalogueFor({ id: 'fixture-user-b', plan: 'free' }, local);

  expect(reads).toHaveBeenCalledTimes(2);
  expect(cache.size()).toBe(0);
});

it('serves a catalogue decided without shared state to that request only', async () => {
  await attestAllOfferings();
  const reads = failNextSharedStateRead(mocks.store);

  const duringFailure = await catalogueFor({ id: 'fixture-user-a', plan: 'free' });
  const afterRecovery = await catalogueFor({ id: 'fixture-user-b', plan: 'free' });
  const later = await catalogueFor({ id: 'fixture-user-c', plan: 'free' });

  expect(ready(duringFailure)).toEqual([]);
  expect(ready(afterRecovery).length).toBeGreaterThan(0);
  expect(later).toEqual(afterRecovery);
  expect(reads).toHaveBeenCalledTimes(2);
});

it('decides again once the live window has passed instead of serving the cached catalogue', async () => {
  await attestAllOfferings();
  const cached = await catalogueFor({ id: 'fixture-user-a', plan: 'free' });
  expect(ready(cached).length).toBeGreaterThan(0);

  await recordFreeQuotaSuspension(mocks.store, {
    apiKey: API_KEY,
    signal: 'fixture-provider-hold',
    nowMs: Date.now(),
  });
  passLiveWindow();
  const afterWindow = await catalogueFor({ id: 'fixture-user-b', plan: 'free' });

  expect(ready(afterWindow)).toEqual([]);
});

it('serves the outage catalogue, not the last cached one, while shared state stays down', async () => {
  await attestAllOfferings();
  const cached = await catalogueFor({ id: 'fixture-user-a', plan: 'free' });
  expect(ready(cached).length).toBeGreaterThan(0);

  passLiveWindow();
  const outage = failSharedStateReads(mocks.store);
  const duringOutage = await catalogueFor({ id: 'fixture-user-b', plan: 'free' });
  await cache.settle();
  const stillDown = await catalogueFor({ id: 'fixture-user-c', plan: 'free' });
  outage.mockRestore();
  const recovered = await catalogueFor({ id: 'fixture-user-a', plan: 'free' });

  expect(ready(duringOutage)).toEqual([]);
  expect(ready(stillDown)).toEqual([]);
  expect(ready(recovered)).toEqual(ready(cached));
});
