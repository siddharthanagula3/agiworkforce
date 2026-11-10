// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { FreeQuotaMediaOffer } from '@agiworkforce/cloud-contracts';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';

type RateLimitModule = typeof import('@/lib/rate-limit');
type OfferReaderModule = typeof import('@/lib/server/free-media-offer-reader');
type ApiAuthModule = typeof import('@/lib/api-auth');

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  readFreeMediaOffer: vi.fn(),
  getClerkAuthUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/server/free-media-offer-reader', async (importOriginal) => ({
  ...(await importOriginal<OfferReaderModule>()),
  readFreeMediaOffer: mocks.readFreeMediaOffer,
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ApiAuthModule>()),
  getClerkAuthUser: mocks.getClerkAuthUser,
}));

const { GET } = await import('./route');

const OFFERED: FreeQuotaMediaOffer = {
  availability: { image: 'offered', video: 'not_offered' },
  image: { lastDay: '2026-11-30' },
  video: null,
};

function request(): NextRequest {
  return new NextRequest('http://localhost/api/models/free-quota/media-offer');
}

describe('GET /api/models/free-quota/media-offer', () => {
  beforeEach(() => {
    mocks.withRateLimit.mockReset().mockResolvedValue(null);
    mocks.readFreeMediaOffer.mockReset().mockResolvedValue(OFFERED);
    mocks.getClerkAuthUser.mockReset();
  });

  it('answers a signed-out caller with the shared offer and a shared cache lifetime', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(OFFERED);
    expect(response.headers.get('Cache-Control')).toBe(
      `public, s-maxage=${RENDER_CACHE_SECONDS.liveSignal}`,
    );
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
  });

  it('does not let a shared cache keep an answer it could not determine', async () => {
    mocks.readFreeMediaOffer.mockResolvedValue({
      ...OFFERED,
      availability: { image: 'unknown', video: 'not_offered' },
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns the rate limiter answer without reading the offer', async () => {
    mocks.withRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'rate_limited' }, { status: 429 }),
    );

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.readFreeMediaOffer).not.toHaveBeenCalled();
  });
});
