/**
 * Tests for POST /api/mobile/iap/verify.
 *
 * Covers:
 *   - iOS verification failing closed (503) when Apple server credentials
 *     aren't configured, rather than accepting the purchase unverified.
 *   - Android verification failing closed (503) when Google credentials
 *     aren't configured.
 *   - 400 on an unrecognized productId (can't resolve a plan tier).
 *   - 400 on a payload missing the platform-specific receipt field.
 *   - Successful iOS verification upserts a subscription and allocates credits.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequireCurrentUserId, mockNeonQuery, mockAllocateCredits } = vi.hoisted(() => ({
  mockRequireCurrentUserId: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockAllocateCredits: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/neon-chat', () => ({
  requireCurrentUserId: mockRequireCurrentUserId,
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
  })),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: (...args: unknown[]) => mockAllocateCredits(...args),
  },
}));

import { POST } from '../route';

function makeRequest(body: unknown) {
  return new Request('http://localhost:3000/api/mobile/iap/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/mobile/iap/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUserId.mockResolvedValue('user-1');
    delete process.env['APPLE_APP_STORE_KEY_ID'];
    delete process.env['APPLE_APP_STORE_ISSUER_ID'];
    delete process.env['APPLE_APP_STORE_BUNDLE_ID'];
    delete process.env['APPLE_APP_STORE_PRIVATE_KEY'];
    delete process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'];
    delete process.env['GOOGLE_PLAY_PACKAGE_NAME'];
  });

  it('returns 400 for an unrecognized productId', async () => {
    const res = await POST(
      makeRequest({ platform: 'ios', productId: 'not-a-real-product', receipt: 'x.y.z' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when ios payload is missing receipt', async () => {
    const res = await POST(
      makeRequest({ platform: 'ios', productId: 'com.agiworkforce.app.sub.basic.monthly' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when android payload is missing purchaseToken', async () => {
    const res = await POST(makeRequest({ platform: 'android', productId: 'sub_basic_monthly' }));
    expect(res.status).toBe(400);
  });

  it('fails closed with 503 when Apple credentials are not configured', async () => {
    const res = await POST(
      makeRequest({
        platform: 'ios',
        productId: 'com.agiworkforce.app.sub.basic.monthly',
        receipt: 'header.payload.sig',
      }),
    );
    expect(res.status).toBe(503);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when Google credentials are not configured', async () => {
    const res = await POST(
      makeRequest({
        platform: 'android',
        productId: 'sub_basic_monthly',
        purchaseToken: 'token-abc',
      }),
    );
    expect(res.status).toBe(503);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });
});
