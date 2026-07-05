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
import { createError } from '@agiworkforce/utils';

const { mockRequireCurrentUserId, mockNeonQuery, mockAllocateCredits, mockVerifyAppleTransaction } =
  vi.hoisted(() => ({
    mockRequireCurrentUserId: vi.fn(),
    mockNeonQuery: vi.fn(),
    mockAllocateCredits: vi.fn(),
    mockVerifyAppleTransaction: vi.fn(),
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

// Mocked to isolate the route's own upsert/credit-allocation logic — real
// Apple-server-JWT signing and HTTP calls are exercised by
// iap-verify-apple's own unit tests, not here. The mock reproduces the one
// piece of that module's behavior other tests below depend on: failing
// closed with serviceUnavailable when Apple server env vars aren't set.
vi.mock('@/lib/server/iap-verify-apple', () => ({
  verifyAppleTransaction: (...args: unknown[]) => mockVerifyAppleTransaction(...args),
}));

function defaultVerifyAppleTransactionMock(): void {
  mockVerifyAppleTransaction.mockImplementation(async () => {
    const configured =
      process.env['APPLE_APP_STORE_KEY_ID'] &&
      process.env['APPLE_APP_STORE_ISSUER_ID'] &&
      process.env['APPLE_APP_STORE_BUNDLE_ID'] &&
      process.env['APPLE_APP_STORE_PRIVATE_KEY'];
    if (!configured) {
      throw createError.serviceUnavailable(
        'Apple purchase verification is not configured on the server',
      );
    }
    throw new Error('mockVerifyAppleTransaction: no resolved value set for this test');
  });
}

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
    defaultVerifyAppleTransactionMock();
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

  describe('successful iOS verification', () => {
    beforeEach(() => {
      // getAppleServerConfig() only needs these to be present to attempt
      // verification — verifyAppleTransaction itself is mocked below, so
      // the actual JWT/key contents never get used.
      process.env['APPLE_APP_STORE_KEY_ID'] = 'key-id';
      process.env['APPLE_APP_STORE_ISSUER_ID'] = 'issuer-id';
      process.env['APPLE_APP_STORE_BUNDLE_ID'] = 'com.agiworkforce.app';
      process.env['APPLE_APP_STORE_PRIVATE_KEY'] = 'dGVzdA=='; // base64 placeholder
    });

    it('upserts a subscription and allocates credits for a verified active transaction', async () => {
      mockVerifyAppleTransaction.mockResolvedValue({
        transactionId: 'txn-1',
        originalTransactionId: 'orig-txn-1',
        productId: 'com.agiworkforce.app.sub.pro.monthly',
        purchaseDate: Date.parse('2026-07-01T00:00:00.000Z'),
        expiresDate: Date.parse('2026-08-01T00:00:00.000Z'),
        revocationDate: null,
        environment: 'Production',
      });
      mockNeonQuery.mockResolvedValue([{ id: 'sub-123' }]);
      mockAllocateCredits.mockResolvedValue(undefined);

      const res = await POST(
        makeRequest({
          platform: 'ios',
          productId: 'com.agiworkforce.app.sub.pro.monthly',
          receipt: 'header.payload.sig',
        }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ success: true, planTier: 'pro', status: 'active' });

      expect(mockNeonQuery).toHaveBeenCalledTimes(1);
      const [, params] = mockNeonQuery.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual([
        'user-1',
        'active',
        'pro',
        'orig-txn-1',
        null,
        new Date('2026-07-01T00:00:00.000Z').toISOString(),
        new Date('2026-08-01T00:00:00.000Z').toISOString(),
        false,
        null,
      ]);

      expect(mockAllocateCredits).toHaveBeenCalledWith(
        'user-1',
        'sub-123',
        'pro',
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );
    });

    it('marks the subscription canceled when Apple reports a revocation', async () => {
      mockVerifyAppleTransaction.mockResolvedValue({
        transactionId: 'txn-2',
        originalTransactionId: 'orig-txn-2',
        productId: 'com.agiworkforce.app.sub.basic.monthly',
        purchaseDate: Date.parse('2026-06-01T00:00:00.000Z'),
        expiresDate: Date.parse('2026-07-01T00:00:00.000Z'),
        revocationDate: Date.parse('2026-06-15T00:00:00.000Z'),
        environment: 'Production',
      });
      mockNeonQuery.mockResolvedValue([{ id: 'sub-456' }]);

      const res = await POST(
        makeRequest({
          platform: 'ios',
          productId: 'com.agiworkforce.app.sub.basic.monthly',
          receipt: 'header.payload.sig',
        }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ planTier: 'basic', status: 'canceled' });
    });
  });
});
