/**
 * Subscription Service Tests
 *
 * Tests for subscription management, credit allocation, and Stripe sync
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock CreditService
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getOrCreateAccount: vi.fn().mockResolvedValue('account-123'),
    resetForPeriod: vi.fn().mockResolvedValue('account-123'),
  },
}));

// Mock price-tier-mapping
vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: vi.fn((metadata, priceId) => {
    if (metadata?.plan_tier) return metadata.plan_tier;
    if (priceId?.includes('hobby')) return 'hobby';
    if (priceId?.includes('pro')) return 'pro';
    if (priceId?.includes('max')) return 'max';
    return null;
  }),
  isValidPlanTier: vi.fn((tier) => ['free', 'hobby', 'pro', 'max', 'enterprise'].includes(tier)),
}));

// Mock Supabase
const mockSupabaseClient = {
  from: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Import after mocks
import { SubscriptionService } from '@/lib/services/subscription-service';
import { CreditService } from '@/lib/services/credit-service';

describe('Subscription Service', () => {
  const mockUserId = 'user-123';

  const mockSubscription = {
    id: 'sub-1',
    user_id: mockUserId,
    plan_tier: 'pro',
    status: 'active',
    current_period_start: '2026-01-01T00:00:00Z',
    current_period_end: '2026-02-01T00:00:00Z',
    stripe_subscription_id: 'sub_stripe123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSubscription', () => {
    it('should return subscription for user', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockSubscription, error: null }),
          }),
        }),
      });

      const subscription = await SubscriptionService.getSubscription(mockUserId);

      expect(subscription).toBeDefined();
      expect(subscription?.plan_tier).toBe('pro');
      expect(subscription?.status).toBe('active');
    });

    it('should return null when no subscription found (PGRST116)', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'No rows found' },
            }),
          }),
        }),
      });

      const subscription = await SubscriptionService.getSubscription(mockUserId);
      expect(subscription).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'OTHER', message: 'DB error' },
            }),
          }),
        }),
      });

      await expect(SubscriptionService.getSubscription(mockUserId)).rejects.toMatchObject({
        message: 'DB error',
      });
    });

    it('should default plan_tier to free if null', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...mockSubscription, plan_tier: null },
              error: null,
            }),
          }),
        }),
      });

      const subscription = await SubscriptionService.getSubscription(mockUserId);
      expect(subscription?.plan_tier).toBe('free');
    });

    it('should default status to none if null', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...mockSubscription, status: null },
              error: null,
            }),
          }),
        }),
      });

      const subscription = await SubscriptionService.getSubscription(mockUserId);
      expect(subscription?.status).toBe('none');
    });
  });

  describe('allocateCreditsForPeriod', () => {
    const periodStart = new Date('2026-01-01');
    const periodEnd = new Date('2026-02-01');

    it('should allocate credits for hobby tier (350 cents)', async () => {
      await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'hobby',
        periodStart,
        periodEnd,
      );

      expect(CreditService.getOrCreateAccount).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        350,
      );
    });

    it('should allocate credits for pro tier (1200 cents)', async () => {
      await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'pro',
        periodStart,
        periodEnd,
      );

      expect(CreditService.getOrCreateAccount).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        1200,
      );
    });

    it('should allocate credits for max tier (15000 cents)', async () => {
      await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'max',
        periodStart,
        periodEnd,
      );

      expect(CreditService.getOrCreateAccount).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        15000,
      );
    });

    it('should not allocate credits for free tier', async () => {
      const result = await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'free',
        periodStart,
        periodEnd,
      );

      expect(result).toBe('');
      expect(CreditService.getOrCreateAccount).not.toHaveBeenCalled();
    });

    it('should not allocate credits for enterprise tier (custom)', async () => {
      const result = await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'enterprise',
        periodStart,
        periodEnd,
      );

      expect(result).toBe('');
      expect(CreditService.getOrCreateAccount).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive tier names', async () => {
      await SubscriptionService.allocateCreditsForPeriod(
        mockUserId,
        'sub-1',
        'PRO',
        periodStart,
        periodEnd,
      );

      expect(CreditService.getOrCreateAccount).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        1200,
      );
    });
  });

  describe('resetCreditsForNewPeriod', () => {
    const periodStart = new Date('2026-02-01');
    const periodEnd = new Date('2026-03-01');

    it('should reset credits for pro tier', async () => {
      await SubscriptionService.resetCreditsForNewPeriod(
        mockUserId,
        'sub-1',
        'pro',
        periodStart,
        periodEnd,
      );

      expect(CreditService.resetForPeriod).toHaveBeenCalledWith(
        mockUserId,
        'sub-1',
        periodStart,
        periodEnd,
        1200,
      );
    });

    it('should not reset credits for free tier', async () => {
      const result = await SubscriptionService.resetCreditsForNewPeriod(
        mockUserId,
        'sub-1',
        'free',
        periodStart,
        periodEnd,
      );

      expect(result).toBe('');
      expect(CreditService.resetForPeriod).not.toHaveBeenCalled();
    });
  });

  describe('getCreditAllocation', () => {
    it('should return correct credits for each tier', () => {
      expect(SubscriptionService.getCreditAllocation('free')).toBe(0);
      expect(SubscriptionService.getCreditAllocation('hobby')).toBe(350);
      expect(SubscriptionService.getCreditAllocation('pro')).toBe(1200);
      expect(SubscriptionService.getCreditAllocation('max')).toBe(15000);
      expect(SubscriptionService.getCreditAllocation('enterprise')).toBe(0);
    });

    it('should return 0 for unknown tier', () => {
      expect(SubscriptionService.getCreditAllocation('unknown')).toBe(0);
    });

    it('should handle case-insensitive tier names', () => {
      expect(SubscriptionService.getCreditAllocation('PRO')).toBe(1200);
      expect(SubscriptionService.getCreditAllocation('Hobby')).toBe(350);
    });
  });
});
