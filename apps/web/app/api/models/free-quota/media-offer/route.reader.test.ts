// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  FREE_QUOTA_MEDIA_OFFER_PATH,
  type FreeQuotaCatalogue,
  type FreeQuotaModel,
} from '@agiworkforce/cloud-contracts';
import { freeMediaOfferFor } from '@/lib/server/free-quota-catalogue';
import type { LimitedMediaOffer } from '@/lib/server/free-pools';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';
type RateLimitModule = typeof import('@/lib/rate-limit');
type FreePoolsModule = typeof import('@/lib/server/free-pools');
type CatalogueCacheModule = typeof import('@/lib/server/free-quota-catalogue-cache');

const mocks = vi.hoisted(() => ({
  limitedOffer: undefined as LimitedMediaOffer | undefined,
  readCatalogue: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<FreePoolsModule>();
  return {
    ...actual,
    loadFreePools: () => ({ ...actual.loadFreePools(), limitedMediaOffer: mocks.limitedOffer }),
  };
});
vi.mock('@/lib/server/free-quota-catalogue-cache', async (importOriginal) => ({
  ...(await importOriginal<CatalogueCacheModule>()),
  readSharedFreeQuotaCatalogue: mocks.readCatalogue,
}));

const { GET } = await import('./route');

const OFFER: LimitedMediaOffer = { dailyCapPerUser: { image: 5, video: 1 } };

function model(category: FreeQuotaModel['category'], expiresOn: string | null): FreeQuotaModel {
  return {
    key: `fixture/${category}`,
    displayName: `Fixture ${category}`,
    providerModelId: null,
    category,
    limit: null,
    unit: null,
    consumedApproximate: null,
    expiresOn,
    status: 'ready',
  };
}

const CATALOGUE: FreeQuotaCatalogue = {
  issuer: 'fixture-issuer',
  observedOn: '2026-10-04',
  evidenceUrl: 'https://provider.example/benefits',
  reportedEligible: 2,
  reportedUnavailable: 0,
  models: [model('image', '2026-10-21'), model('video', null)],
};

function get() {
  return GET(new NextRequest(`https://agiworkforce.com${FREE_QUOTA_MEDIA_OFFER_PATH}`));
}

beforeEach(() => {
  mocks.limitedOffer = OFFER;
  mocks.readCatalogue.mockReset();
});

it('answers with the body and shared cache header the three-step read produced before it moved', async () => {
  mocks.readCatalogue.mockResolvedValue(CATALOGUE);

  const response = await get();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    image: freeMediaOfferFor(CATALOGUE, OFFER, 'image'),
    video: freeMediaOfferFor(CATALOGUE, OFFER, 'video'),
  });
  expect(freeMediaOfferFor(CATALOGUE, OFFER, 'image')).toEqual({ lastDay: '2026-10-20' });
  expect(freeMediaOfferFor(CATALOGUE, OFFER, 'video')).toEqual({ lastDay: null });
  expect(response.headers.get('Cache-Control')).toBe(
    `public, s-maxage=${RENDER_CACHE_SECONDS.liveSignal}`,
  );
});

it('answers with an empty offer under the same header while the offer is not configured', async () => {
  mocks.limitedOffer = undefined;

  const response = await get();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ image: null, video: null });
  expect(response.headers.get('Cache-Control')).toBe(
    `public, s-maxage=${RENDER_CACHE_SECONDS.liveSignal}`,
  );
  expect(mocks.readCatalogue).not.toHaveBeenCalled();
});

it('still fails the request, uncached, when the catalogue cannot be read', async () => {
  mocks.readCatalogue.mockRejectedValue(new Error('store unreachable'));

  const response = await get();

  expect(response.status).toBeGreaterThanOrEqual(500);
  expect(response.headers.get('Cache-Control') ?? '').not.toContain('s-maxage');
});
