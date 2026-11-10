// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { FreeQuotaMediaOffer } from '@agiworkforce/cloud-contracts';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';

type RateLimitModule = typeof import('@/lib/rate-limit');

const mocks = vi.hoisted(() => ({ read: vi.fn(), rateLimit: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/server/free-media-offer-reader', () => ({
  readFreeMediaOffer: mocks.read,
  readFreeMediaOfferForRender: vi.fn(),
}));
import { GET } from './route';

const offer: FreeQuotaMediaOffer = {
  availability: { image: 'not_offered', video: 'not_offered' },
  image: null,
  video: null,
};
const request = () => new NextRequest('https://example.com/api/models/free-quota/media-offer');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(offer);
  mocks.rateLimit.mockResolvedValue(null);
});

it('shares a fully observed offer for the canonical live-signal cache duration', async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(offer);
  expect(response.headers.get('Cache-Control')).toBe(
    `public, s-maxage=${RENDER_CACHE_SECONDS.liveSignal}`,
  );
});

it('does not cache an offer with unknown availability', async () => {
  mocks.read.mockResolvedValue({
    ...offer,
    availability: { ...offer.availability, image: 'unknown' },
  });
  expect((await GET(request())).headers.get('Cache-Control')).toBe('no-store');
});

it('returns the rate limit response before reading shared offer state', async () => {
  mocks.rateLimit.mockResolvedValue(NextResponse.json({ error: 'Limited' }, { status: 429 }));
  expect((await GET(request())).status).toBe(429);
  expect(mocks.read).not.toHaveBeenCalled();
});
