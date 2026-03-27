/**
 * Token Enforcement Service Tests
 *
 * Tests for the critical billing/token enforcement functionality.
 * Ensures users cannot exceed their token balance and proper deductions occur.
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
import {
  checkTokenSufficiency,
  deductTokens,
  getUserTokenBalance,
  estimateTokensForRequest,
  checkMonthlyAllowance,
  canUserMakeRequest,
  type UsageMetadata,
} from './token-enforcement-service';

// Mock Supabase client
vi.mock('@shared/lib/supabase-client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(),
          gte: vi.fn(),
        })),
      })),
    })),
  },
}));

import { supabase } from '@shared/lib/supabase-client';

function buildCreditAccountQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
      }),
    }),
  } as unknown as ReturnType<typeof supabase.from>;
}

describe('Token Enforcement Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('checkTokenSufficiency', () => {
    const mockUserId = 'user-123';
    const mockRpc = vi.mocked(supabase.rpc) as unknown as ReturnType<typeof vi.fn>;

    it('should allow request when user has sufficient balance', async () => {
      // get_credit_balance returns scalar balance in cents
      mockRpc.mockResolvedValueOnce({
        data: 10000,
        error: null,
      });

      const result = await checkTokenSufficiency(mockUserId, 1000);

      expect(result.allowed).toBe(true);
      expect(result.currentBalance).toBe(10000);
      expect(result.estimatedCost).toBe(1000);
      expect(result.reason).toBeUndefined();
    });

    it('should deny request when user has insufficient balance', async () => {
      // get_credit_balance returns scalar balance in cents
      mockRpc.mockResolvedValueOnce({
        data: 500,
        error: null,
      });

      const result = await checkTokenSufficiency(mockUserId, 1000);

      expect(result.allowed).toBe(false);
      expect(result.currentBalance).toBe(500);
      expect(result.estimatedCost).toBe(1000);
      expect(result.reason).toContain('Insufficient credits');
    });

    it('should deny request when balance fetch fails', async () => {
      // RPC fails
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Database error',
          code: '500',
          details: '',
          hint: '',
          name: 'PostgrestError',
        },
      } as unknown);

      // Fallback: token_credits table also fails
      const mockFrom = vi.mocked(supabase.from);
      mockFrom.mockReturnValueOnce(
        buildCreditAccountQuery({
          data: null,
          error: { message: 'Database error' },
        }),
      );

      const result = await checkTokenSufficiency(mockUserId, 1000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Failed to fetch');
    });

    it('should handle exact balance equal to estimated cost', async () => {
      mockRpc.mockResolvedValueOnce({
        data: 1000,
        error: null,
      });

      const result = await checkTokenSufficiency(mockUserId, 1000);

      // Exact match should be allowed
      expect(result.allowed).toBe(true);
      expect(result.currentBalance).toBe(1000);
    });

    it('should handle zero balance', async () => {
      mockRpc.mockResolvedValueOnce({
        data: 0,
        error: null,
      });

      const result = await checkTokenSufficiency(mockUserId, 1000);

      expect(result.allowed).toBe(false);
      expect(result.currentBalance).toBe(0);
    });
  });

  describe('getUserTokenBalance', () => {
    const mockUserId = 'user-123';
    const mockRpc = vi.mocked(supabase.rpc) as unknown as ReturnType<typeof vi.fn>;
    const mockFrom = vi.mocked(supabase.from);

    it('should return balance from RPC when available', async () => {
      // get_credit_balance returns scalar (number), not an array
      mockRpc.mockResolvedValueOnce({
        data: 5000,
        error: null,
      });

      const balance = await getUserTokenBalance(mockUserId);

      expect(balance).toBe(5000);
      expect(mockRpc).toHaveBeenCalledWith('get_credit_balance', {
        p_user_id: mockUserId,
      });
    });

    it('should fallback to direct query when RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC not available', code: '500' } as unknown,
      });

      // Fallback: token_credits table with credits_remaining_cents field
      mockFrom.mockReturnValueOnce(
        buildCreditAccountQuery({
          data: {
            credits_remaining_cents: 3000,
            credits_allocated_cents: 3500,
            period_end: '2026-04-01T00:00:00.000Z',
          },
          error: null,
        }),
      );

      const balance = await getUserTokenBalance(mockUserId);

      expect(balance).toBe(3000);
    });

    it('should return null when no credit record exists (fail closed)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC not available', code: '500' } as unknown,
      });

      // token_credits returns no record (data: null, error: null)
      mockFrom.mockReturnValueOnce(
        buildCreditAccountQuery({
          data: null,
          error: null,
        }),
      );

      const balance = await getUserTokenBalance(mockUserId);

      // Security: fail closed — no record means denial
      expect(balance).toBeNull();
    });

    it('should return null when token_credits query has a database error', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC not available', code: '500' } as unknown,
      });

      // token_credits returns database error
      mockFrom.mockReturnValueOnce(
        buildCreditAccountQuery({
          data: null,
          error: { message: 'Database error' },
        }),
      );

      const balance = await getUserTokenBalance(mockUserId);

      // Security: fail closed on database errors
      expect(balance).toBeNull();
    });

    it('should return null when all lookups fail (fail closed)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC failed', code: '500' } as unknown,
      });

      mockFrom.mockReturnValueOnce(
        buildCreditAccountQuery({
          data: null,
          error: { message: 'Database error' },
        }),
      );

      const balance = await getUserTokenBalance(mockUserId);

      // Security: fail closed - return null instead of default balance
      expect(balance).toBeNull();
    });

    it('should ensure balance is never negative', async () => {
      // get_credit_balance returns negative scalar
      mockRpc.mockResolvedValueOnce({
        data: -100,
        error: null,
      });

      const balance = await getUserTokenBalance(mockUserId);

      expect(balance).toBe(0); // Should be clamped to 0
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
    const mockRpc = vi.mocked(supabase.rpc) as unknown as ReturnType<typeof vi.fn>;

    it('should successfully deduct tokens via deduct_credits', async () => {
      // deduct_credits succeeds and returns updated balance
      mockRpc.mockResolvedValueOnce({
        data: [{ success: true, remaining_cents: 9850 }],
        error: null,
      });

      const result = await deductTokens(mockUserId, mockMetadata);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(9850);
      expect(mockRpc).toHaveBeenCalledWith(
        'deduct_credits',
        expect.objectContaining({
          p_user_id: mockUserId,
          p_amount_cents: expect.any(Number),
          p_description: 'anthropic/claude-sonnet-4-6 usage',
          p_metadata: expect.objectContaining({
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            usage_cost_cents: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle deduction failure', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Insufficient balance', code: 'P0001' },
      });

      const result = await deductTokens(mockUserId, mockMetadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Credit deduction failed');
    });

    it('should handle unexpected errors', async () => {
      mockRpc.mockRejectedValueOnce(new Error('Network error'));

      const result = await deductTokens(mockUserId, mockMetadata);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('checkMonthlyAllowance', () => {
    const mockUserId = 'user-123';
    const mockRpc = vi.mocked(supabase.rpc) as unknown as ReturnType<typeof vi.fn>;
    const mockFrom = vi.mocked(supabase.from);

    it('should return the active billing-period budget when a credit account exists', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            credits_allocated_cents: 3500,
            credits_remaining_cents: 2900,
            period_end: '2026-04-01T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const result = await checkMonthlyAllowance(mockUserId);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(3500);
      expect(result.used).toBe(600);
    });

    it('should deny when the billing-period budget is exhausted', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            credits_allocated_cents: 350,
            credits_remaining_cents: 0,
            period_end: '2026-04-01T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const result = await checkMonthlyAllowance(mockUserId);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(350);
      expect(result.used).toBe(350);
    });

    it('should fall back to token_credits when the RPC is unavailable', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC unavailable', code: '500' },
      });
      mockFrom.mockReturnValueOnce(
        buildCreditAccountQuery({
          data: {
            credits_allocated_cents: 1050,
            credits_remaining_cents: 1000,
            period_end: '2026-04-01T00:00:00.000Z',
          },
          error: null,
        }),
      );

      const result = await checkMonthlyAllowance(mockUserId);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(1050);
      expect(result.used).toBe(50);
    });

    it('should fail closed when no active credit account exists', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC unavailable', code: '500' },
      });
      mockFrom.mockReturnValueOnce(
        buildCreditAccountQuery({
          data: null,
          error: null,
        }),
      );

      const result = await checkMonthlyAllowance(mockUserId);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
    });
  });

  describe('canUserMakeRequest', () => {
    const mockUserId = 'user-123';
    const mockRpc = vi.mocked(supabase.rpc) as unknown as ReturnType<typeof vi.fn>;

    it('should allow request when all checks pass', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            credits_allocated_cents: 3500,
            credits_remaining_cents: 3000,
            period_end: '2026-04-01T00:00:00.000Z',
          },
        ],
        error: null,
      });
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            credits_allocated_cents: 3500,
            credits_remaining_cents: 3000,
          },
        ],
        error: null,
      });

      const result = await canUserMakeRequest(mockUserId, 1000);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should deny when the billing-period budget is exhausted', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            credits_allocated_cents: 350,
            credits_remaining_cents: 0,
            period_end: '2026-04-01T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const result = await canUserMakeRequest(mockUserId, 1000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Usage budget exhausted');
    });

    it('should deny when credits are below the estimated cost', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            credits_allocated_cents: 3500,
            credits_remaining_cents: 500,
            period_end: '2026-04-01T00:00:00.000Z',
          },
        ],
        error: null,
      });
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            credits_allocated_cents: 3500,
            credits_remaining_cents: 500,
          },
        ],
        error: null,
      });

      const result = await canUserMakeRequest(mockUserId, 1000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient credits');
    });
  });
});
