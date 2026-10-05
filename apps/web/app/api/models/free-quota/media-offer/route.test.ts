// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import { FreeQuotaMediaOfferSchema } from '@agiworkforce/cloud-contracts';
import {
  credentialSha256,
  recordFreeQuotaSuspension,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import { loadFreePools, type LimitedMediaOffer } from '@/lib/server/free-pools';
import { freeQuotaFixtureNow, servableFreeQuotaOfferings } from '@/test/free-quota-fixtures';
type ScanModule0 = typeof import('@/lib/rate-limit');
type ScanModule1 = typeof import('@/lib/server/key-value');
type ScanModule2 = typeof import('@/lib/server/free-pools');
type ScanModule3 = typeof import('@/lib/server/media-storage');
type ScanModule4 = typeof import('@/lib/server/rls-db');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore | null,
  limitedOffer: undefined as LimitedMediaOffer | undefined,
  identity: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getUserScopedDb: mocks.identity,
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  isGeneratedMediaStorageConfigured: () => true,
}));
vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
  return {
    ...actual,
    loadFreePools: () => {
      const document = actual.loadFreePools();
      const inventory = document.inventory!;
      return {
        ...document,
        limitedMediaOffer: mocks.limitedOffer,
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
const inventory = loadFreePools().inventory!;
const NOW = freeQuotaFixtureNow(inventory);
const OFFER: LimitedMediaOffer = { dailyCapPerUser: { image: 5, video: 1 } };

async function offer() {
  const response = await GET(
    new NextRequest('https://agiworkforce.com/api/models/free-quota/media-offer'),
  );
  expect(response.status).toBe(200);
  return { response, body: FreeQuotaMediaOfferSchema.parse(await response.json()) };
}

async function attest() {
  await writeQuotaAttestation(mocks.store!, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
}

const DAY_MS = 86_400_000;

function servedAt(category: 'image' | 'video', nowMs: number): boolean {
  return servableFreeQuotaOfferings(inventory, { apiKey: API_KEY, nowMs }).some(
    ({ offering }) => offering.category === category,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  mocks.limitedOffer = OFFER;
  mocks.identity.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('reports the offer per kind with the last UTC day an offering of that kind is served, and nothing else', async () => {
  await attest();

  const { response, body } = await offer();

  expect(Object.keys(body).sort()).toEqual(['image', 'video']);
  for (const kind of ['image', 'video'] as const) {
    expect(Object.keys(body[kind]!), kind).toEqual(['lastDay']);
    const endOfLastDay = Date.parse(`${body[kind]!.lastDay!}T23:59:59.999Z`);
    expect(endOfLastDay, kind).toBeGreaterThan(NOW);
    expect(servedAt(kind, endOfLastDay), kind).toBe(true);
    expect(servedAt(kind, endOfLastDay + DAY_MS), kind).toBe(false);
  }
  expect(response.headers.get('Cache-Control')).toMatch(/^public, s-maxage=\d+/);
  expect(mocks.identity).not.toHaveBeenCalled();
});

it('reports nothing while the offer is not configured, without reading the quota state', async () => {
  await attest();
  mocks.limitedOffer = undefined;
  const reads = vi.spyOn(mocks.store!, 'batch');

  expect((await offer()).body).toEqual({ image: null, video: null });
  expect(reads).not.toHaveBeenCalled();
});

it('reports only the kind whose cap is above zero', async () => {
  await attest();
  mocks.limitedOffer = { dailyCapPerUser: { image: 5, video: 0 } };

  const { body } = await offer();

  expect(body.image).not.toBeNull();
  expect(body.video).toBeNull();
});

it('reports nothing while the console check is missing, a billing signal stands, or shared state is absent', async () => {
  expect((await offer()).body).toEqual({ image: null, video: null });

  await attest();
  await recordFreeQuotaSuspension(mocks.store!, {
    apiKey: API_KEY,
    signal: 'fixture-provider-hold',
    nowMs: Date.now(),
  });
  expect((await offer()).body).toEqual({ image: null, video: null });

  mocks.store = null;
  expect((await offer()).body).toEqual({ image: null, video: null });
});
