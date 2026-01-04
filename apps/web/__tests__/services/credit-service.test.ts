import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Supabase
const mockRpc = vi.fn();
const mockSupabaseClient = {
  rpc: mockRpc,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Import after mocks
import { CreditService } from '@/lib/services/credit-service';

describe('CreditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // getDailyLimit Tests
  // =========================================================================
  describe('getDailyLimit', () => {
    it('should calculate 30% of monthly credits as daily limit', () => {
      expect(CreditService.getDailyLimit(10000)).toBe(3000);
      expect(CreditService.getDailyLimit(5000)).toBe(1500);
      expect(CreditService.getDailyLimit(100)).toBe(30);
    });

    it('should floor the result for non-integer values', () => {
      expect(CreditService.getDailyLimit(333)).toBe(99); // 333 * 0.3 = 99.9, floored to 99
      expect(CreditService.getDailyLimit(10)).toBe(3); // 10 * 0.3 = 3
    });

    it('should return 0 for 0 or negative monthly credits', () => {
      expect(CreditService.getDailyLimit(0)).toBe(0);
    });

    it('should handle large credit amounts', () => {
      expect(CreditService.getDailyLimit(1000000)).toBe(300000);
    });
  });

  // =========================================================================
  // getBalance Tests
  // =========================================================================
  describe('getBalance', () => {
    it('should return credit balance for user', async () => {
      const mockBalance = {
        account_id: 'acc_123',
        period_start: '2025-01-01T00:00:00Z',
        period_end: '2025-02-01T00:00:00Z',
        credits_allocated_cents: 5000,
        credits_used_cents: 1000,
        credits_remaining_cents: 4000,
        percentage_used: 20,
        daily_limit_cents: 1500,
        daily_used_cents: 500,
        daily_remaining_cents: 1000,
        last_daily_reset_at: '2025-01-02T00:00:00Z',
      };

      mockRpc.mockResolvedValue({ data: [mockBalance], error: null });

      const result = await CreditService.getBalance('user-123');

      expect(mockRpc).toHaveBeenCalledWith('get_credit_balance', {
        p_user_id: 'user-123',
      });
      expect(result).toEqual(mockBalance);
    });

    it('should return null if no balance exists', async () => {
      mockRpc.mockResolvedValue({ data: {}, error: null });

      const result = await CreditService.getBalance('user-123');

      expect(result).toBeNull();
    });

    it('should return null if data is null', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      const result = await CreditService.getBalance('user-123');

      expect(result).toBeNull();
    });

    it('should throw error if database call fails', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });

      await expect(CreditService.getBalance('user-123')).rejects.toThrow();
    });

    it('should include daily limit information in balance', async () => {
      const mockBalance = {
        account_id: 'acc_123',
        period_start: '2025-01-01T00:00:00Z',
        period_end: '2025-02-01T00:00:00Z',
        credits_allocated_cents: 5000,
        credits_used_cents: 1000,
        credits_remaining_cents: 4000,
        percentage_used: 20,
        daily_limit_cents: 1500,
        daily_used_cents: 1400,
        daily_remaining_cents: 100,
        last_daily_reset_at: '2025-01-02T05:00:00Z',
      };

      mockRpc.mockResolvedValue({ data: [mockBalance], error: null });

      const result = await CreditService.getBalance('user-123');

      expect(result?.daily_limit_cents).toBe(1500);
      expect(result?.daily_used_cents).toBe(1400);
      expect(result?.daily_remaining_cents).toBe(100);
      expect(result?.last_daily_reset_at).toBe('2025-01-02T05:00:00Z');
    });
  });

  // =========================================================================
  // checkAvailable Tests
  // =========================================================================
  describe('checkAvailable', () => {
    it('should return true when credits are available', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null });

      const result = await CreditService.checkAvailable('user-123', 100);

      expect(mockRpc).toHaveBeenCalledWith('check_credits_available', {
        p_user_id: 'user-123',
        p_amount_cents: 100,
      });
      expect(result).toBe(true);
    });

    it('should return false when credits are insufficient', async () => {
      mockRpc.mockResolvedValue({ data: false, error: null });

      const result = await CreditService.checkAvailable('user-123', 10000);

      expect(result).toBe(false);
    });

    it('should return false on database error', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await CreditService.checkAvailable('user-123', 100);

      expect(result).toBe(false);
    });

    it('should return false on exception', async () => {
      mockRpc.mockRejectedValue(new Error('Network error'));

      const result = await CreditService.checkAvailable('user-123', 100);

      expect(result).toBe(false);
    });

    it('should check for zero amount', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null });

      const result = await CreditService.checkAvailable('user-123', 0);

      expect(result).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('check_credits_available', {
        p_user_id: 'user-123',
        p_amount_cents: 0,
      });
    });
  });

  // =========================================================================
  // deductCredits Tests
  // =========================================================================
  describe('deductCredits', () => {
    it('should deduct credits successfully', async () => {
      const mockResult = {
        success: true,
        account_id: 'acc_123',
        remaining_cents: 4900,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const result = await CreditService.deductCredits(
        'user-123',
        100,
        'API call: claude-sonnet-4-5',
        { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      );

      expect(mockRpc).toHaveBeenCalledWith('deduct_credits', {
        p_user_id: 'user-123',
        p_amount_cents: 100,
        p_description: 'API call: claude-sonnet-4-5',
        p_metadata: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle negative amount for refunds', async () => {
      const mockResult = {
        success: true,
        account_id: 'acc_123',
        remaining_cents: 5100,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const result = await CreditService.deductCredits(
        'user-123',
        -100, // Negative = refund
        'Refund for failed request',
        { type: 'refund', reason: 'request_failure' },
      );

      expect(result.success).toBe(true);
      expect(result.remaining_cents).toBe(5100);
    });

    it('should return error when monthly limit reached', async () => {
      const mockResult = {
        success: false,
        code: 'MONTHLY_CREDIT_LIMIT_REACHED',
        available: 0,
        required: 100,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const result = await CreditService.deductCredits('user-123', 100);

      expect(result.success).toBe(false);
      expect(result.code).toBe('MONTHLY_CREDIT_LIMIT_REACHED');
    });

    it('should return error when daily limit reached', async () => {
      const mockResult = {
        success: false,
        code: 'DAILY_CREDIT_LIMIT_REACHED',
        daily_limit: 1500,
        daily_used: 1450,
        daily_remaining: 50,
        available: 50,
        required: 100,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const result = await CreditService.deductCredits('user-123', 100);

      expect(result.success).toBe(false);
      expect(result.code).toBe('DAILY_CREDIT_LIMIT_REACHED');
      expect(result.daily_limit).toBe(1500);
      expect(result.daily_remaining).toBe(50);
    });

    it('should handle database error gracefully', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await CreditService.deductCredits('user-123', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle exception gracefully', async () => {
      mockRpc.mockRejectedValue(new Error('Connection timeout'));

      const result = await CreditService.deductCredits('user-123', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });

    it('should use null description and empty metadata when not provided', async () => {
      const mockResult = {
        success: true,
        account_id: 'acc_123',
        remaining_cents: 4900,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      await CreditService.deductCredits('user-123', 100);

      expect(mockRpc).toHaveBeenCalledWith('deduct_credits', {
        p_user_id: 'user-123',
        p_amount_cents: 100,
        p_description: null,
        p_metadata: {},
      });
    });
  });

  // =========================================================================
  // getOrCreateAccount Tests
  // =========================================================================
  describe('getOrCreateAccount', () => {
    it('should return existing account ID', async () => {
      mockRpc.mockResolvedValue({ data: 'acc_existing123', error: null });

      const result = await CreditService.getOrCreateAccount(
        'user-123',
        'sub_456',
        new Date('2025-01-01'),
        new Date('2025-02-01'),
        5000,
      );

      expect(result).toBe('acc_existing123');
    });

    it('should create new account when none exists', async () => {
      mockRpc.mockResolvedValue({ data: 'acc_new789', error: null });

      const result = await CreditService.getOrCreateAccount(
        'user-123',
        'sub_456',
        new Date('2025-01-01'),
        new Date('2025-02-01'),
        10000,
      );

      expect(mockRpc).toHaveBeenCalledWith('get_or_create_credit_account', {
        p_user_id: 'user-123',
        p_subscription_id: 'sub_456',
        p_period_start: expect.any(String),
        p_period_end: expect.any(String),
        p_credits_allocated_cents: 10000,
      });
      expect(result).toBe('acc_new789');
    });

    it('should throw error on database failure', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Failed to create account' },
      });

      await expect(
        CreditService.getOrCreateAccount(
          'user-123',
          'sub_456',
          new Date('2025-01-01'),
          new Date('2025-02-01'),
          5000,
        ),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // resetForPeriod Tests
  // =========================================================================
  describe('resetForPeriod', () => {
    it('should reset credits for new period', async () => {
      mockRpc.mockResolvedValue({ data: 'acc_reset123', error: null });

      const result = await CreditService.resetForPeriod(
        'user-123',
        'sub_456',
        new Date('2025-02-01'),
        new Date('2025-03-01'),
        5000,
      );

      expect(mockRpc).toHaveBeenCalledWith('reset_credits_for_period', {
        p_user_id: 'user-123',
        p_subscription_id: 'sub_456',
        p_period_start: expect.any(String),
        p_period_end: expect.any(String),
        p_credits_allocated_cents: 5000,
      });
      expect(result).toBe('acc_reset123');
    });

    it('should throw error on database failure', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Reset failed' },
      });

      await expect(
        CreditService.resetForPeriod(
          'user-123',
          'sub_456',
          new Date('2025-02-01'),
          new Date('2025-03-01'),
          5000,
        ),
      ).rejects.toThrow();
    });

    it('should handle plan upgrade with increased credits', async () => {
      mockRpc.mockResolvedValue({ data: 'acc_upgraded', error: null });

      const result = await CreditService.resetForPeriod(
        'user-123',
        'sub_789', // New subscription ID
        new Date('2025-01-15'),
        new Date('2025-02-15'),
        50000, // Max plan credits
      );

      expect(result).toBe('acc_upgraded');
      expect(mockRpc).toHaveBeenCalledWith('reset_credits_for_period', {
        p_user_id: 'user-123',
        p_subscription_id: 'sub_789',
        p_period_start: expect.any(String),
        p_period_end: expect.any(String),
        p_credits_allocated_cents: 50000,
      });
    });
  });

  // =========================================================================
  // Edge Cases and Integration Scenarios
  // =========================================================================
  describe('Edge Cases', () => {
    it('should handle concurrent deduction attempts', async () => {
      // First call succeeds
      mockRpc.mockResolvedValueOnce({
        data: { success: true, remaining_cents: 4900 },
        error: null,
      });
      // Second call fails due to insufficient credits
      mockRpc.mockResolvedValueOnce({
        data: {
          success: false,
          code: 'MONTHLY_CREDIT_LIMIT_REACHED',
        },
        error: null,
      });

      const [result1, result2] = await Promise.all([
        CreditService.deductCredits('user-123', 100),
        CreditService.deductCredits('user-123', 100),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
    });

    it('should handle very small amounts (sub-cent)', async () => {
      const mockResult = {
        success: true,
        account_id: 'acc_123',
        remaining_cents: 4999,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const result = await CreditService.deductCredits('user-123', 1);

      expect(result.success).toBe(true);
    });

    it('should handle very large amounts', async () => {
      const mockResult = {
        success: false,
        code: 'MONTHLY_CREDIT_LIMIT_REACHED',
        available: 5000,
        required: 100000,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const result = await CreditService.deductCredits('user-123', 100000);

      expect(result.success).toBe(false);
      expect(result.available).toBe(5000);
    });
  });
});
