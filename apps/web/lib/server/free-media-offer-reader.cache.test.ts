// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { FREE_QUOTA_MEDIA_OFFER_PATH } from '@agiworkforce/cloud-contracts';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import { credentialSha256, writeQuotaAttestation } from '@/lib/free-quota-authorization';
import type { LimitedMediaOffer } from '@/lib/server/free-pools';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';
type NextCacheModule = typeof import('next/cache');
type RateLimitModule = typeof import('@/lib/rate-limit');
type KeyValueModule = typeof import('@/lib/server/key-value');
type MediaStorageModule = typeof import('@/lib/server/media-storage');
type FreePoolsModule = typeof import('@/lib/server/free-pools');
type LoggerModule = typeof import('@/lib/logger');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  logError: vi.fn(),
}));

const cache = await vi.hoisted(async () => {
  const { createStaleWhileRevalidateCache } =
    await import('@/test/next-cache-stale-while-revalidate');
  return createStaleWhileRevalidateCache();
});

vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<NextCacheModule>()),
  unstable_cache: cache.unstable_cache,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: async () => null,
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<MediaStorageModule>()),
  isGeneratedMediaStorageConfigured: () => true,
}));
vi.mock('@/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<LoggerModule>();
  return {
    ...actual,
    logger: Object.assign(Object.create(actual.logger) as LoggerModule['logger'], {
      error: mocks.logError,
    }),
  };
});
vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<FreePoolsModule>();
  const limitedMediaOffer: LimitedMediaOffer = { dailyCapPerUser: { image: 5, video: 1 } };
  return {
    ...actual,
    loadFreePools: () => {
      const document = actual.loadFreePools();
      const inventory = document.inventory!;
      return {
        ...document,
        limitedMediaOffer,
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

const { FREE_MEDIA_OFFER_RENDER_BUDGET_MS, readFreeMediaOfferForRender } =
  await import('./free-media-offer-reader');
const { GET } = await import('@/app/api/models/free-quota/media-offer/route');

const API_KEY = 'fixture-provider-key';
const LIVE_WINDOW_MS = RENDER_CACHE_SECONDS.liveSignal * 1_000;
const READY_OFFER = {
  image: { lastDay: expect.anything() },
  video: { lastDay: expect.anything() },
};

async function attestAllOfferings() {
  await writeQuotaAttestation(mocks.store, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
}

async function passLiveWindow() {
  await cache.settle();
  vi.setSystemTime(Date.now() + LIVE_WINDOW_MS + 1);
}

function neverAnswer(store: MemoryKeyValueStore) {
  const batch = store.batch.bind(store);
  return vi.spyOn(store, 'batch').mockImplementation(() =>
    Object.assign(batch(), {
      exec: () => new Promise<unknown[]>(() => undefined),
    }),
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  mocks.logError.mockReset();
  cache.clear();
  await attestAllOfferings();
});

afterEach(() => vi.useRealTimers());

it('reads the shared store once for every home page visit and endpoint answer inside the live window', async () => {
  const reads = vi.spyOn(mocks.store, 'batch');

  const first = await readFreeMediaOfferForRender();
  const second = await readFreeMediaOfferForRender();
  const third = await readFreeMediaOfferForRender();
  const response = await GET(
    new NextRequest(`https://agiworkforce.com${FREE_QUOTA_MEDIA_OFFER_PATH}`),
  );

  expect(first).toEqual(READY_OFFER);
  expect(second).toEqual(first);
  expect(third).toEqual(first);
  expect(await response.json()).toEqual(first);
  expect(reads).toHaveBeenCalledTimes(1);
  expect(cache.size()).toBe(1);
});

it('decides again after the live window instead of serving the cached offer', async () => {
  expect(await readFreeMediaOfferForRender()).toEqual(READY_OFFER);
  await passLiveWindow();
  vi.stubEnv('QWEN_API_KEY', '');

  expect(await readFreeMediaOfferForRender()).toEqual({ image: null, video: null });
});

it('gives up at the render budget when the store stops answering after the window', async () => {
  expect(await readFreeMediaOfferForRender()).toEqual(READY_OFFER);
  await passLiveWindow();
  neverAnswer(mocks.store);
  const settled = vi.fn();
  const visit = readFreeMediaOfferForRender().then((offer) => {
    settled(offer);
    return offer;
  });

  await vi.advanceTimersByTimeAsync(FREE_MEDIA_OFFER_RENDER_BUDGET_MS - 1);
  expect(settled).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);

  expect(settled).toHaveBeenCalledWith(null);
  expect(await visit).toBeNull();
  expect(mocks.logError).toHaveBeenCalledTimes(1);
});

it('gives up at the render budget when the store never answers the first visit', async () => {
  neverAnswer(mocks.store);
  const settled = vi.fn();
  void readFreeMediaOfferForRender().then(settled);

  await vi.advanceTimersByTimeAsync(FREE_MEDIA_OFFER_RENDER_BUDGET_MS);

  expect(settled).toHaveBeenCalledWith(null);
  expect(mocks.logError).toHaveBeenCalledTimes(1);
});
