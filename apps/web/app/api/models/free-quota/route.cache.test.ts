// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import { credentialSha256, writeQuotaAttestation } from '@/lib/free-quota-authorization';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';
type ScanModule0 = typeof import('@/lib/api-auth');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/server/rls-db');
type ScanModule3 = typeof import('@/lib/server/key-value');
type ScanModule4 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule5 = typeof import('@/lib/server/free-pools');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  cached: new Map<string, unknown>(),
  user: { id: 'fixture-user-a', plan: 'free' },
}));

vi.mock('next/cache', () => ({
  unstable_cache:
    (compute: () => Promise<unknown>, keyParts: string[]) => async (): Promise<unknown> => {
      const key = keyParts.join('|');
      if (!mocks.cached.has(key)) mocks.cached.set(key, await compute());
      return mocks.cached.get(key);
    },
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

function failNextSharedStateRead(store: MemoryKeyValueStore) {
  const batch = store.batch.bind(store);
  return vi.spyOn(store, 'batch').mockImplementationOnce(() =>
    Object.assign(batch(), {
      exec: async (): Promise<unknown[]> => {
        throw new Error('fixture: the shared state store timed out');
      },
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  mocks.cached.clear();
});

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
  expect(mocks.cached.size).toBe(0);
});

it('serves a catalogue decided without shared state to that request only', async () => {
  await writeQuotaAttestation(mocks.store, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
  const reads = failNextSharedStateRead(mocks.store);

  const duringFailure = await catalogueFor({ id: 'fixture-user-a', plan: 'free' });
  const afterRecovery = await catalogueFor({ id: 'fixture-user-b', plan: 'free' });
  const later = await catalogueFor({ id: 'fixture-user-c', plan: 'free' });

  expect(ready(duringFailure)).toEqual([]);
  expect(ready(afterRecovery).length).toBeGreaterThan(0);
  expect(later).toEqual(afterRecovery);
  expect(reads).toHaveBeenCalledTimes(2);
});
