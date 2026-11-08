// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  FREE_QUOTA_MEDIA_CATEGORIES,
  FREE_QUOTA_MEDIA_OFFER_PATH,
  FreeQuotaMediaOfferSchema,
  type FreeQuotaMediaOffer,
} from '@agiworkforce/cloud-contracts';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';

type RateLimitModule = typeof import('@/lib/rate-limit');
type MediaOfferReaderModule = typeof import('@/lib/server/free-media-offer-reader');

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn<RateLimitModule['withRateLimit']>(),
  readOffer: vi.fn<MediaOfferReaderModule['readFreeMediaOffer']>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/server/free-media-offer-reader', async (importOriginal) => ({
  ...(await importOriginal<MediaOfferReaderModule>()),
  readFreeMediaOffer: mocks.readOffer,
}));

import { GET } from './route';

function request() {
  return new NextRequest(`http://localhost:3000${FREE_QUOTA_MEDIA_OFFER_PATH}`);
}

function offer(): FreeQuotaMediaOffer {
  return {
    availability: { image: 'not_offered', video: 'not_offered' },
    image: null,
    video: null,
  };
}

beforeEach(() => {
  mocks.rateLimit.mockResolvedValue(null);
  mocks.readOffer.mockResolvedValue(offer());
});

describe('GET /api/models/free-quota/media-offer', () => {
  it('shares a known unavailable offer for the configured live-signal window', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(FreeQuotaMediaOfferSchema.parse(await response.json())).toEqual(offer());
    expect(response.headers.get('Cache-Control')).toBe(
      `public, s-maxage=${RENDER_CACHE_SECONDS.liveSignal}`,
    );
    expect(mocks.readOffer).toHaveBeenCalledExactlyOnceWith();
  });

  it('preserves offered media and its expiry in the shared response', async () => {
    const available: FreeQuotaMediaOffer = {
      ...offer(),
      availability: { image: 'offered', video: 'not_offered' },
      image: { lastDay: '2026-12-31' },
    };
    mocks.readOffer.mockResolvedValue(available);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(FreeQuotaMediaOfferSchema.parse(await response.json())).toEqual(available);
    expect(response.headers.get('Cache-Control')).toBe(
      `public, s-maxage=${RENDER_CACHE_SECONDS.liveSignal}`,
    );
  });

  it.each(FREE_QUOTA_MEDIA_CATEGORIES)(
    'does not cache an unknown %s result for other visitors',
    async (category) => {
      const unavailable = offer();
      unavailable.availability[category] = 'unknown';
      mocks.readOffer.mockResolvedValue(unavailable);

      const response = await GET(request());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(unavailable);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    },
  );

  it('returns the rate-limit response before reading shared availability', async () => {
    const limited = NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '10', 'Cache-Control': 'no-store' } },
    );
    mocks.rateLimit.mockResolvedValue(limited);
    const incoming = request();

    const response = await GET(incoming);

    expect(response).toBe(limited);
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith(incoming, 'model-catalog');
    expect(mocks.readOffer).not.toHaveBeenCalled();
  });

  it('returns a failure without publishing private reader diagnostics or a shared cache entry', async () => {
    mocks.readOffer.mockRejectedValue(new Error('Private provider availability diagnostic'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('Private provider availability diagnostic');
    expect(response.headers.get('Cache-Control') ?? '').not.toContain('public');
  });
});
