import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression guard for the P0 private-allowance leak: POST /api/mobile/iap/verify
// previously serialized `usageBudgetCents` (a private managed-compute allowance).
// Public IAP responses must expose only tier, status, and period end.
vi.mock('server-only', () => ({}));

const { mockQuery, mockAllocate, mockVerifyApple, mockResolveTier, mockRequireUser } = vi.hoisted(
  () => ({
    mockQuery: vi.fn(),
    mockAllocate: vi.fn(),
    mockVerifyApple: vi.fn(),
    mockResolveTier: vi.fn(),
    mockRequireUser: vi.fn(),
  }),
);

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
vi.mock('@/lib/server/neon-chat', () => ({
  requireCurrentUserId: (...args: unknown[]) => mockRequireUser(...args),
}));
vi.mock('@/lib/server/iap-product-catalog', () => ({
  resolveTierFromProductId: (...args: unknown[]) => mockResolveTier(...args),
}));
vi.mock('@/lib/server/iap-verify-apple', () => ({
  verifyAppleTransaction: (...args: unknown[]) => mockVerifyApple(...args),
}));
vi.mock('@/lib/server/iap-verify-google', () => ({ verifyGoogleSubscription: vi.fn() }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { allocateCreditsForPeriod: (...args: unknown[]) => mockAllocate(...args) },
}));

import { POST } from '@/app/api/mobile/iap/verify/route';

describe('POST /api/mobile/iap/verify — private allowance never serialized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue('user_iap_privacy');
    mockResolveTier.mockReturnValue({ tier: 'pro' });
    mockVerifyApple.mockResolvedValue({
      revocationDate: null,
      expiresDate: Date.now() + 30 * 24 * 3_600_000,
      purchaseDate: Date.now(),
      originalTransactionId: 'orig-tx-1',
    });
    mockQuery.mockResolvedValue([{ id: 'sub_iap_1' }]);
    mockAllocate.mockResolvedValue(undefined);
  });

  it('returns only tier/status/currentPeriodEnd — no cents/budget/allowance field', async () => {
    const request = new Request('http://localhost/api/mobile/iap/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'ios',
        productId: 'com.agiworkforce.app.sub.pro.monthly',
        receipt: 'jws-representation-abc',
      }),
    });

    const response = await POST(request as never);
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      success: true,
      planTier: 'pro',
      status: 'active',
      currentPeriodEnd: expect.any(String),
    });
    expect(body).not.toHaveProperty('usageBudgetCents');
    for (const key of Object.keys(body)) {
      expect(key).not.toMatch(/budget|allowance|cents|units/i);
    }
  });
});
