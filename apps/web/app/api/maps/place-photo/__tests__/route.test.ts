import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  withRateLimit: vi.fn(),
  configured: vi.fn(),
  photo: vi.fn(),
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
vi.mock('@/lib/places/google-places-provider', () => ({
  GOOGLE_PLACES_PROVIDER_ID: 'google_places',
  buildGoogleTextQuery: vi.fn(),
  normalizeGooglePlace: vi.fn(),
  createGooglePlacesProvider: () => ({ configured: mocks.configured, photo: mocks.photo }),
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const REF = 'places/abc/photos/def';

function request(search: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/maps/place-photo${search}`);
}

describe('/api/maps/place-photo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.configured.mockReturnValue(true);
    mocks.photo.mockResolvedValue({
      ok: true,
      body: new Uint8Array([1, 2, 3, 4]),
      contentType: 'image/jpeg',
    });
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());
    const response = await GET(request(`?ref=${REF}`));
    expect(response.status).toBe(401);
    expect(mocks.photo).not.toHaveBeenCalled();
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await GET(request(`?ref=${REF}`));
    expect(response.status).toBe(429);
    expect(mocks.photo).not.toHaveBeenCalled();
  });

  it('rejects a missing reference', async () => {
    const response = await GET(request(''));
    expect(response.status).toBe(400);
    expect(mocks.photo).not.toHaveBeenCalled();
  });

  it('rejects an oversized reference', async () => {
    const response = await GET(request(`?ref=${'a'.repeat(513)}`));
    expect(response.status).toBe(400);
    expect(mocks.photo).not.toHaveBeenCalled();
  });

  it('answers 404 when places are not configured', async () => {
    mocks.configured.mockReturnValue(false);
    const response = await GET(request(`?ref=${REF}`));
    expect(response.status).toBe(404);
    expect(mocks.photo).not.toHaveBeenCalled();
  });

  it('maps an upstream refusal of the input to 400 and anything else to 502', async () => {
    mocks.photo.mockResolvedValueOnce({ ok: false, errorCode: 'invalid_tool_input' });
    expect((await GET(request(`?ref=${REF}`))).status).toBe(400);
    mocks.photo.mockResolvedValueOnce({ ok: false, errorCode: 'upstream_error' });
    expect((await GET(request(`?ref=${REF}`))).status).toBe(502);
  });

  it('clamps the width and streams the photo bytes', async () => {
    const response = await GET(request(`?ref=${REF}&w=99999`));
    expect(response.status).toBe(200);
    expect(mocks.photo).toHaveBeenCalledWith({ reference: REF, maxWidthPx: 1200 });
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('uses the default width when none is given', async () => {
    await GET(request(`?ref=${REF}`));
    expect(mocks.photo).toHaveBeenCalledWith({ reference: REF, maxWidthPx: 400 });
  });
});
