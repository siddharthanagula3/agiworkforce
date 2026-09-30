import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  withRateLimit: vi.fn(),
  mapTileProvider: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: mocks.getClerkAuthUser,
}));
vi.mock('@/lib/maps/map-tile-provider', () => ({
  MAP_TILE_ATTRIBUTION_ENV: 'AGI_MAP_TILE_ATTRIBUTION',
  MAP_TILE_ATTRIBUTION_MAX_LENGTH: 200,
  MAP_TILE_DARK_ATTRIBUTION_ENV: 'AGI_MAP_TILE_DARK_ATTRIBUTION',
  MAP_TILE_DARK_URL_TEMPLATE_ENV: 'AGI_MAP_TILE_DARK_URL_TEMPLATE',
  MAP_TILE_MAX_ZOOM_ENV: 'AGI_MAP_TILE_MAX_ZOOM',
  MAP_TILE_STYLES: vi.fn(),
  MAP_TILE_URL_TEMPLATE_ENV: 'AGI_MAP_TILE_URL_TEMPLATE',
  MAP_TILE_ZOOM_CEILING: 22,
  parseMapTileStyle: vi.fn(),
  upstreamTileUrl: vi.fn(),
  MAP_TILE_MIN_ZOOM: 2,
  mapTileProvider: mocks.mapTileProvider,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/maps/config');
}

describe('/api/maps/config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.mapTileProvider.mockReturnValue({
      urlTemplate: 'https://tiles.vendor.example/{z}/{x}/{y}.png?key=secret',
      darkUrlTemplate: 'https://tiles.vendor.example/dark/{z}/{x}/{y}.png?key=secret',
      attribution: 'Tiles by Vendor',
      darkAttribution: 'Dark tiles by Vendor',
      dimLightTiles: false,
      maxZoom: 19,
    });
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.mapTileProvider).not.toHaveBeenCalled();
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
  });

  it('returns proxy templates and never the upstream tile url', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    const body = await response.json();
    expect(body).toEqual({
      tileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}',
      attribution: 'Tiles by Vendor',
      darkTileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}?style=dark',
      darkAttribution: 'Dark tiles by Vendor',
      dimLightTiles: false,
      minZoom: 2,
      maxZoom: 19,
    });
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
