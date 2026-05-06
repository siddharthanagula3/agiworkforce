/**
 * Tests for credit deduction in /api/media/image/generate
 *
 * Verifies:
 * - Credits are checked before generation (402 when insufficient)
 * - Credits are reserved (deducted) before invoking the provider
 * - Credits are refunded on generation failure
 * - Reconciliation adjusts after generation completes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks (must appear before route import) ──────────────────────────────

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: (handler: (req: NextRequest) => Promise<Response>) => (req: NextRequest) =>
    handler(req),
}));

// ─── Supabase ───────────────────────────────────────────────────────────────
const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

// ─── SubscriptionService ────────────────────────────────────────────────────
const mockGetSubscription = vi.fn();
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

// ─── CreditService ──────────────────────────────────────────────────────────
const mockCheckAvailable = vi.fn();
const mockDeductCredits = vi.fn();
const mockGetBalance = vi.fn();

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
    deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
    generateIdempotencyKey: (userId: string, op: string, requestId: string) =>
      `${userId}:${op}:${requestId}`,
  },
}));

// ─── Global fetch (provider API calls) ──────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Import route under test ─────────────────────────────────────────────
import { POST } from '@/app/api/media/image/generate/route';

// ─── Fixtures ────────────────────────────────────────────────────────────────
const TEST_USER = { id: 'user-credit-test', email: 'credit@test.com' };

const PRO_SUBSCRIPTION = {
  id: 'sub_pro',
  user_id: TEST_USER.id,
  status: 'active',
  plan_tier: 'pro',
  current_period_start: new Date('2026-01-01'),
  current_period_end: new Date('2026-02-01'),
};

const MOCK_BALANCE = {
  account_id: 'acct_test',
  credits_remaining_cents: 0,
  credits_allocated_cents: 100,
  credits_used_cents: 100,
  daily_remaining_cents: 0,
};

const OPENAI_SUCCESS_RESPONSE = {
  ok: true,
  json: async () => ({ data: [{ url: 'https://example.com/generated.png' }] }),
};

function makeAuthedRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/media/image/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-jwt-token',
    },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/media/image/generate — credit deduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Defaults: authenticated pro user
    mockGetUser.mockResolvedValue({ data: { user: TEST_USER }, error: null });
    mockGetSubscription.mockResolvedValue(PRO_SUBSCRIPTION);

    // Env vars
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key';
    process.env['OPENAI_API_KEY'] = 'sk-test-openai-key';
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['STABILITY_API_KEY'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('402 when insufficient credits', () => {
    it('returns 402 when CreditService.checkAvailable returns false', async () => {
      mockCheckAvailable.mockResolvedValue(false);
      mockGetBalance.mockResolvedValue(MOCK_BALANCE);

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset' }));
      const data = await response.json();

      expect(response.status).toBe(402);
      expect(data.error.code).toBe('insufficient_credits');
    });

    it('includes credits_required and credits_remaining in 402 response', async () => {
      mockCheckAvailable.mockResolvedValue(false);
      mockGetBalance.mockResolvedValue({
        ...MOCK_BALANCE,
        credits_remaining_cents: 0,
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a sunset', n: 1 }));
      const data = await response.json();

      expect(response.status).toBe(402);
      expect(typeof data.error.credits_required).toBe('number');
      expect(data.error.credits_remaining).toBe(0);
    });

    it('does NOT call the provider when credits are insufficient', async () => {
      mockCheckAvailable.mockResolvedValue(false);
      mockGetBalance.mockResolvedValue(MOCK_BALANCE);

      await POST(makeAuthedRequest({ prompt: 'a sunset' }));

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('credit reservation before generation', () => {
    it('calls deductCredits (reservation) before calling the provider fetch', async () => {
      mockCheckAvailable.mockResolvedValue(true);
      mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 90 });
      mockFetch.mockResolvedValue(OPENAI_SUCCESS_RESPONSE);

      await POST(makeAuthedRequest({ prompt: 'a mountain', provider: 'openai' }));

      // deductCredits should have been called (at least for the reservation)
      expect(mockDeductCredits).toHaveBeenCalled();

      // The reservation call should come before fetch (ordering checked via call order)
      const deductOrder = mockDeductCredits.mock.invocationCallOrder[0]!;
      const fetchOrder = mockFetch.mock.invocationCallOrder[0]!;
      expect(deductOrder).toBeLessThan(fetchOrder);
    });

    it('reservation deductCredits call uses type: reservation metadata', async () => {
      mockCheckAvailable.mockResolvedValue(true);
      mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 80 });
      mockFetch.mockResolvedValue(OPENAI_SUCCESS_RESPONSE);

      await POST(makeAuthedRequest({ prompt: 'a forest' }));

      const firstCall = mockDeductCredits.mock.calls[0]!;
      // Signature: deductCredits(client, userId, amountCents, description, metadata, ikey)
      const metadata = firstCall[4] as Record<string, unknown>;
      expect(metadata['type']).toBe('reservation');
    });

    it('returns 402 when reservation deductCredits fails', async () => {
      mockCheckAvailable.mockResolvedValue(true);
      mockDeductCredits.mockResolvedValue({
        success: false,
        code: 'MONTHLY_CREDIT_LIMIT_REACHED',
      });

      const response = await POST(makeAuthedRequest({ prompt: 'a volcano' }));
      const data = await response.json();

      expect(response.status).toBe(402);
      expect(data.error.code).toBe('MONTHLY_CREDIT_LIMIT_REACHED');
      // Provider should never be called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('credit refund on generation failure', () => {
    it('refunds reserved credits when provider fetch throws', async () => {
      mockCheckAvailable.mockResolvedValue(true);
      mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 90 });
      // Provider fails
      mockFetch.mockRejectedValue(new Error('Provider connection refused'));

      await POST(makeAuthedRequest({ prompt: 'a storm' }));

      // Should have been called twice: once to reserve, once to refund
      expect(mockDeductCredits).toHaveBeenCalledTimes(2);

      // The refund call should pass a negative amount.
      // Signature: deductCredits(client, userId, amountCents, description, metadata, ikey)
      const refundCall = mockDeductCredits.mock.calls[1]!;
      const refundAmount = refundCall[2] as number;
      expect(refundAmount).toBeLessThan(0);

      // Refund metadata should include type: refund
      const refundMeta = refundCall[4] as Record<string, unknown>;
      expect(refundMeta['type']).toBe('refund');
    });

    it('returns a 422 response on provider failure (not 500)', async () => {
      mockCheckAvailable.mockResolvedValue(true);
      mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 90 });
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const response = await POST(makeAuthedRequest({ prompt: 'a cave' }));

      expect(response.status).toBe(422);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('successful generation with credit reconciliation', () => {
    it('deducts credits and returns success on happy path', async () => {
      mockCheckAvailable.mockResolvedValue(true);
      mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 92 });
      mockFetch.mockResolvedValue(OPENAI_SUCCESS_RESPONSE);

      const response = await POST(makeAuthedRequest({ prompt: 'a rainbow' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.images).toHaveLength(1);
      expect(data.provider).toBe('openai');
    });

    it('includes cost_estimate in the response', async () => {
      mockCheckAvailable.mockResolvedValue(true);
      mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 92 });
      mockFetch.mockResolvedValue(OPENAI_SUCCESS_RESPONSE);

      const response = await POST(makeAuthedRequest({ prompt: 'a river' }));
      const data = await response.json();

      expect(typeof data.cost_estimate).toBe('number');
      expect(data.cost_estimate).toBeGreaterThanOrEqual(0);
    });

    it('calls deductCredits at least once on success', async () => {
      mockCheckAvailable.mockResolvedValue(true);
      mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 85 });
      mockFetch.mockResolvedValue(OPENAI_SUCCESS_RESPONSE);

      await POST(makeAuthedRequest({ prompt: 'a lighthouse' }));

      expect(mockDeductCredits).toHaveBeenCalled();
    });
  });
});
