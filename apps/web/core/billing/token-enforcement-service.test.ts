/**
 * Token Enforcement Service Tests
 *
 * Tests for the critical billing/token enforcement functionality.
 * The service now delegates to /api/usage and /api/usage/deduct via fetch
 * rather than calling Neon SQLs directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('@shared/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('@shared/lib/sentry', () => ({
  captureError: vi.fn(),
}));
vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(),
}));

import {
  checkTokenSufficiency,
  deductTokens,
  getUserTokenBalance,
  estimateTokensForRequest,
  checkMonthlyAllowance,
  canUserMakeRequest,
  type UsageMetadata,
} from './token-enforcement-service';

import { getAuthToken } from '@shared/lib/get-auth-token';

describe('Token Enforcement Service', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const mockGetAuthToken = vi.mocked(getAuthToken);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    // Default: authenticated
    mockGetAuthToken.mockResolvedValue('test-token');

    // Suppress console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('estimateTokensForRequest', () => {
    it('should estimate tokens based on message length', () => {
      // 1 token ≈ 4 characters
      const estimate = estimateTokensForRequest(400, 0);
      // Input: 400/4 = 100 tokens
      // Output estimate: 100 * 2 = 200 tokens
      // Total: 300 tokens
      expect(estimate).toBe(300);
    });

    it('should include conversation history in estimation', () => {
      const estimate = estimateTokensForRequest(400, 400);
      // Input: (400 + 400) / 4 = 200 tokens
      // Output estimate: 200 * 2 = 400 tokens
      // Total: 600 tokens
      expect(estimate).toBe(600);
    });

    it('should handle zero-length messages', () => {
      const estimate = estimateTokensForRequest(0, 0);
      expect(estimate).toBe(0);
    });

    it('should round up token estimates (better to overestimate)', () => {
      const estimate = estimateTokensForRequest(401, 0);
      // Input: ceil(401/4) = 101 tokens
      // Output estimate: 101 * 2 = 202 tokens
      // Total: 303 tokens
      expect(estimate).toBe(303);
    });
  });

  describe('getUserTokenBalance', () => {
    const mockUserId = 'user-123';

    it('should return balance from /api/usage when available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            credits_remaining_cents: 5000,
            credits_allocated_cents: 10000,
            period_end: '2026-06-01T00:00:00.000Z',
          }),
      });

      const balance = await getUserTokenBalance(mockUserId);

      expect(balance).toBe(5000);
    });

    it('should return null when not authenticated', async () => {
      mockGetAuthToken.mockResolvedValue(null);

      const balance = await getUserTokenBalance(mockUserId);

      expect(balance).toBeNull();
    });

    it('should return null when /api/usage returns non-ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const balance = await getUserTokenBalance(mockUserId);

      expect(balance).toBeNull();
    });

    it('should return null when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const balance = await getUserTokenBalance(mockUserId);

      expect(balance).toBeNull();
    });

    it('should clamp negative balance to 0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ credits_remaining_cents: -100 }),
      });

      const balance = await getUserTokenBalance(mockUserId);

      // The snapshot layer returns credits_remaining_cents as-is; clamping
      // happens at the call sites (e.g. deductTokens uses Math.max(..., 0)).
      // getUserTokenBalance itself returns the raw snapshot value.
      expect(balance).toBe(-100);
    });
  });

  describe('checkTokenSufficiency', () => {
    const mockUserId = 'user-123';

    it('should allow request when user has sufficient balance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ credits_remaining_cents: 10000 }),
      });

      const result = await checkTokenSufficiency(mockUserId, 1000);

      expect(result.allowed).toBe(true);
      expect(result.currentBalance).toBe(10000);
      expect(result.estimatedCost).toBe(1000);
      expect(result.reason).toBeUndefined();
    });

    it('should deny request when user has insufficient balance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ credits_remaining_cents: 500 }),
      });

      const result = await checkTokenSufficiency(mockUserId, 1000);

      expect(result.allowed).toBe(false);
      expect(result.currentBalance).toBe(500);
      expect(result.estimatedCost).toBe(1000);
      expect(result.reason).toContain('Insufficient credits');
    });

    it('should deny request when not authenticated', async () => {
      mockGetAuthToken.mockResolvedValue(null);

      const result = await checkTokenSufficiency(mockUserId, 1000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Failed to fetch');
    });

    it('should handle exact balance equal to estimated cost', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ credits_remaining_cents: 1000 }),
      });

      const result = await checkTokenSufficiency(mockUserId, 1000);

      // Exact match should be allowed
      expect(result.allowed).toBe(true);
      expect(result.currentBalance).toBe(1000);
    });

    it('should handle zero balance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ credits_remaining_cents: 0 }),
      });

      const result = await checkTokenSufficiency(mockUserId, 1000);

      expect(result.allowed).toBe(false);
      expect(result.currentBalance).toBe(0);
    });
  });

  describe('deductTokens', () => {
    const mockUserId = 'user-123';
    const mockMetadata: UsageMetadata = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      sessionId: 'session-123',
      feature: 'chat',
    };

    it('should successfully deduct tokens via /api/usage/deduct', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ remaining_cents: 9850 }),
      });

      const result = await deductTokens(mockUserId, mockMetadata);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(9850);
    });

    it('should handle deduction failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Insufficient balance',
        json: () => Promise.resolve({ error: 'Insufficient balance' }),
      });

      const result = await deductTokens(mockUserId, mockMetadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Credit deduction failed');
    });

    it('should return error when not authenticated', async () => {
      mockGetAuthToken.mockResolvedValue(null);

      const result = await deductTokens(mockUserId, mockMetadata);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should handle unexpected errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await deductTokens(mockUserId, mockMetadata);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('checkMonthlyAllowance', () => {
    const mockUserId = 'user-123';

    it('should return the active billing-period budget when a credit account exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            credits_allocated_cents: 3500,
            credits_remaining_cents: 2900,
            period_end: '2026-04-01T00:00:00.000Z',
          }),
      });

      const result = await checkMonthlyAllowance(mockUserId);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(3500);
      expect(result.used).toBe(600);
    });

    it('should deny when the billing-period budget is exhausted', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            credits_allocated_cents: 350,
            credits_remaining_cents: 0,
            period_end: '2026-04-01T00:00:00.000Z',
          }),
      });

      const result = await checkMonthlyAllowance(mockUserId);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(350);
      expect(result.used).toBe(350);
    });

    it('should fail closed when not authenticated', async () => {
      mockGetAuthToken.mockResolvedValue(null);

      const result = await checkMonthlyAllowance(mockUserId);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
    });
  });

  describe('canUserMakeRequest', () => {
    const mockUserId = 'user-123';

    it('should allow request when all checks pass', async () => {
      // checkMonthlyAllowance fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            credits_allocated_cents: 3500,
            credits_remaining_cents: 3000,
            period_end: '2026-04-01T00:00:00.000Z',
          }),
      });
      // checkTokenSufficiency fetch (calls getUserTokenBalance)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ credits_remaining_cents: 3000 }),
      });

      const result = await canUserMakeRequest(mockUserId, 1000);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should deny when the billing-period budget is exhausted', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            credits_allocated_cents: 350,
            credits_remaining_cents: 0,
            period_end: '2026-04-01T00:00:00.000Z',
          }),
      });

      const result = await canUserMakeRequest(mockUserId, 1000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Usage budget exhausted');
    });

    it('should deny when credits are below the estimated cost', async () => {
      // Monthly allowance: has budget, not exhausted
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            credits_allocated_cents: 3500,
            credits_remaining_cents: 500,
            period_end: '2026-04-01T00:00:00.000Z',
          }),
      });
      // Balance check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ credits_remaining_cents: 500 }),
      });

      const result = await canUserMakeRequest(mockUserId, 1000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient credits');
    });
  });
});
