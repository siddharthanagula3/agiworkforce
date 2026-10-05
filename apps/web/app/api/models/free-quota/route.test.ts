// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import { providerOfferingDisplayName } from '@agiworkforce/types';
import {
  credentialSha256,
  freeQuotaDayResetsAtMs,
  recordFreeQuotaHold,
  reserveFreeQuotaDailyUse,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';
import { loadFreePools, type LimitedMediaOffer } from '@/lib/server/free-pools';
import { freeQuotaFixtureNow } from '@/test/free-quota-fixtures';
type ScanModule0 = typeof import('@/lib/api-auth');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/server/rls-db');
type ScanModule3 = typeof import('@/lib/server/key-value');
type ScanModule4 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule5 = typeof import('@/lib/server/free-pools');
type ScanModule6 = typeof import('@/lib/server/media-storage');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore | null,
  plan: vi.fn(),
  limitedOffer: undefined as LimitedMediaOffer | undefined,
  mediaStorage: false,
}));

vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  isGeneratedMediaStorageConfigured: () => mocks.mediaStorage,
}));

vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  assertAccountActive: vi.fn(async () => undefined),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  getUserScopedDb: vi.fn(async () => ({ userId: 'fixture-user', organizationId: null, db: {} })),
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  resolveEntitledPlanTier: mocks.plan,
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
const NOW = freeQuotaFixtureNow(loadFreePools().inventory!);

async function catalogue(): Promise<{ status: number; body: FreeQuotaCatalogue }> {
  const response = await GET(new NextRequest('https://agiworkforce.com/api/models/free-quota'));
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  return { status: response.status, body: await response.json() };
}

function ready(body: FreeQuotaCatalogue): string[] {
  return body.models.filter((model) => model.status === 'ready').map((model) => model.key);
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  mocks.plan.mockResolvedValue('free');
  mocks.limitedOffer = undefined;
  mocks.mediaStorage = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('answers a Free account in production, offering nothing until the setting is attested', async () => {
  const { status, body } = await catalogue();
  expect(status).toBe(200);
  expect(body.issuer).toBe('QwenCloud');
  expect(body.models.length).toBeGreaterThan(0);
  expect(body.models.every((model) => model.category === 'chat')).toBe(true);
  expect(ready(body)).toEqual([]);
});

it('names each model the way the picker does, never by its raw provider id', async () => {
  const { body } = await catalogue();

  expect(body.models.length).toBeGreaterThan(0);
  for (const model of body.models) {
    expect(model.displayName).toBe(providerOfferingDisplayName(model.key));
    expect(model.displayName).not.toBe(model.providerModelId);
  }
});

it('does not advertise promotional image or video generation to a Free account', async () => {
  await writeQuotaAttestation(mocks.store!, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
  const { body } = await catalogue();

  expect(body.models.length).toBeGreaterThan(0);
  expect(body.models.every((model) => model.category === 'chat')).toBe(true);
});

it('lists attested models as ready and a spent one as exhausted for every account', async () => {
  await writeQuotaAttestation(mocks.store!, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
  const [spent, ...others] = ready((await catalogue()).body);
  expect(others.length).toBeGreaterThan(0);
  await recordFreeQuotaHold(mocks.store!, {
    apiKey: API_KEY,
    offeringKey: spent!,
    cause: 'exhausted',
    nowMs: Date.now(),
  });
  const { body } = await catalogue();
  expect(body.models.find((model) => model.key === spent)!.status).toBe('exhausted');
  expect(ready(body)).toEqual(others);
});

it('offers nothing when the deployment has no shared state store', async () => {
  mocks.store = null;
  const { body } = await catalogue();
  expect(ready(body)).toEqual([]);
});

it('keeps promotional chat offerings exclusive to Free accounts', async () => {
  mocks.plan.mockResolvedValue('pro');
  const { status, body } = await catalogue();
  expect(status).toBe(200);
  expect(body.models.length).toBeGreaterThan(0);
  expect(body.models.every((model) => model.category === 'image')).toBe(true);
});

it('lists eligible image and video offerings for a video-entitled paid tier', async () => {
  mocks.plan.mockResolvedValue('max_15x');
  const { status, body } = await catalogue();
  expect(status).toBe(200);
  expect(body.models.some((model) => model.category === 'image')).toBe(true);
  expect(body.models.some((model) => model.category === 'video')).toBe(true);
  expect(body.models.every((model) => ['image', 'video'].includes(model.category))).toBe(true);
});

it('keeps promotional media unavailable to a paid tier without generation access', async () => {
  mocks.plan.mockResolvedValue('basic');
  const response = await GET(new NextRequest('https://agiworkforce.com/api/models/free-quota'));
  expect(response.status).toBe(403);
});

async function attestAll() {
  await writeQuotaAttestation(mocks.store!, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
}

function categories(body: FreeQuotaCatalogue): string[] {
  return [...new Set(body.models.map((model) => model.category))].sort();
}

it('lists free image and video offerings for a Free account while the limited offer runs, with its own daily terms', async () => {
  mocks.limitedOffer = { dailyCapPerUser: { image: 3, video: 1 } };
  mocks.mediaStorage = true;
  await attestAll();
  await reserveFreeQuotaDailyUse(mocks.store!, {
    userId: 'fixture-user',
    category: 'image',
    cap: 3,
    nowMs: Date.now(),
  });

  const { status, body } = await catalogue();

  expect(status).toBe(200);
  expect(categories(body)).toEqual(['chat', 'image', 'video']);
  const resetsAt = new Date(freeQuotaDayResetsAtMs(NOW)).toISOString();
  expect(body.limitedOffer).toEqual([
    { category: 'image', dailyCap: 3, remainingToday: 2, resetsAt },
    { category: 'video', dailyCap: 1, remainingToday: 1, resetsAt },
  ]);
  const listed = new Set(body.models.map((model) => model.key));
  const readyMedia = body.models
    .filter((model) => model.category !== 'chat' && model.status === 'ready')
    .map((model) => model.key);
  expect(readyMedia.length).toBeGreaterThan(0);
  expect([...body.mediaUseOrder!].sort()).toEqual([...readyMedia].sort());
  expect(body.mediaUseOrder!.every((key) => listed.has(key))).toBe(true);
});

it('marks only the kinds a paid plan lacks as limited', async () => {
  mocks.limitedOffer = { dailyCapPerUser: { image: 3, video: 1 } };

  mocks.plan.mockResolvedValue('basic');
  const basic = (await catalogue()).body;
  expect(categories(basic)).toEqual(['image', 'video']);
  expect(basic.limitedOffer?.map((offer) => offer.category)).toEqual(['image', 'video']);

  mocks.plan.mockResolvedValue('pro');
  const pro = (await catalogue()).body;
  expect(categories(pro)).toEqual(['image', 'video']);
  expect(pro.limitedOffer?.map((offer) => offer.category)).toEqual(['video']);

  mocks.plan.mockResolvedValue('max_15x');
  const max = (await catalogue()).body;
  expect(categories(max)).toEqual(['image', 'video']);
  expect(max.limitedOffer).toBeUndefined();
});

it('leaves a kind whose cap is zero off the offer', async () => {
  mocks.limitedOffer = { dailyCapPerUser: { image: 2, video: 0 } };

  const { body } = await catalogue();

  expect(categories(body)).toEqual(['chat', 'image']);
  expect(body.limitedOffer?.map((offer) => offer.category)).toEqual(['image']);
});

it('does not list the offer for an account kept off managed cloud', async () => {
  mocks.limitedOffer = { dailyCapPerUser: { image: 5, video: 5 } };
  mocks.plan.mockResolvedValue('byok');

  const response = await GET(new NextRequest('https://agiworkforce.com/api/models/free-quota'));

  expect(response.status).toBe(403);
});

it('names no limited terms when the deployment has no shared state store to count in', async () => {
  mocks.limitedOffer = { dailyCapPerUser: { image: 5, video: 5 } };
  mocks.store = null;

  const { body } = await catalogue();

  expect(body.limitedOffer).toBeUndefined();
  expect(ready(body)).toEqual([]);
});
