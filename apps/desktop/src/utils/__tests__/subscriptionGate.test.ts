/**
 * Tests for subscription gate utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkSubscriptionGate, canUseAPIKeys, getUpgradeMessage } from '../subscriptionGate';
import { supabaseAuth } from '../../services/supabaseAuth';

// Mock the supabaseAuth service
vi.mock('../../services/supabaseAuth', () => ({
  supabaseAuth: {
    getState: vi.fn(),
  },
}));

describe('subscriptionGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkSubscriptionGate', () => {
    it('should deny access when user is not authenticated', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: null,
        session: null,
        profile: null,
        subscription: null,
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('Please sign in to use AGI Workforce');
      expect(result.requiresUpgrade).toBe(false);
    });

    it('should deny access when user has no subscription', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: null,
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('A subscription is required to use AGI Workforce');
      expect(result.requiresUpgrade).toBe(true);
      expect(result.currentTier).toBe('free');
      expect(result.currentStatus).toBe('none');
    });

    it('should deny access when subscription is canceled', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: {
          id: 'sub-1',
          user_id: 'user-1',
          plan_tier: 'hobby',
          status: 'canceled',
          stripe_customer_id: 'cus-1',
          stripe_subscription_id: 'sub-1',
          stripe_price_id: 'price-1',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date().toISOString(),
          cancel_at_period_end: false,
          canceled_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toContain('canceled');
      expect(result.requiresUpgrade).toBe(true);
      expect(result.currentTier).toBe('hobby');
      expect(result.currentStatus).toBe('canceled');
    });

    it('should deny access when subscription is past_due and outside grace period', () => {
      // 8 days ago (expired grace period)
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 8);

      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: {
          id: 'sub-1',
          user_id: 'user-1',
          plan_tier: 'hobby',
          status: 'past_due',
          stripe_customer_id: 'cus-1',
          stripe_subscription_id: 'sub-1',
          stripe_price_id: 'price-1',
          current_period_start: new Date().toISOString(),
          current_period_end: pastDate.toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toContain('past_due');
      expect(result.requiresUpgrade).toBe(false);
      expect(result.currentTier).toBe('hobby');
      expect(result.currentStatus).toBe('past_due');
    });

    it('should allow access when subscription is past_due but within grace period', () => {
      // 6 days ago (within 7 day grace period)
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 6);

      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: {
          id: 'sub-1',
          user_id: 'user-1',
          plan_tier: 'hobby',
          status: 'past_due',
          stripe_customer_id: 'cus-1',
          stripe_subscription_id: 'sub-1',
          stripe_price_id: 'price-1',
          current_period_start: new Date().toISOString(),
          current_period_end: pastDate.toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('hobby');
      expect(result.currentStatus).toBe('past_due');
    });

    it('should deny access when user has free tier', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: {
          id: 'sub-1',
          user_id: 'user-1',
          plan_tier: 'free',
          status: 'active',
          stripe_customer_id: 'cus-1',
          stripe_subscription_id: 'sub-1',
          stripe_price_id: 'price-1',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date().toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toContain('Hobby plan or higher');
      expect(result.requiresUpgrade).toBe(true);
      expect(result.currentTier).toBe('free');
      expect(result.currentStatus).toBe('active');
    });

    it('should allow access when user has hobby tier with active status', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: {
          id: 'sub-1',
          user_id: 'user-1',
          plan_tier: 'hobby',
          status: 'active',
          stripe_customer_id: 'cus-1',
          stripe_subscription_id: 'sub-1',
          stripe_price_id: 'price-1',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date().toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('hobby');
      expect(result.currentStatus).toBe('active');
    });

    it('should allow access when user has hobby tier with trialing status', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: {
          id: 'sub-1',
          user_id: 'user-1',
          plan_tier: 'hobby',
          status: 'trialing',
          stripe_customer_id: 'cus-1',
          stripe_subscription_id: 'sub-1',
          stripe_price_id: 'price-1',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date().toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('hobby');
      expect(result.currentStatus).toBe('trialing');
    });

    it('should allow access when user has pro tier', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: {
          id: 'sub-1',
          user_id: 'user-1',
          plan_tier: 'pro',
          status: 'active',
          stripe_customer_id: 'cus-1',
          stripe_subscription_id: 'sub-1',
          stripe_price_id: 'price-1',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date().toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('pro');
    });

    it('should allow access when user has max tier', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: {
          id: 'sub-1',
          user_id: 'user-1',
          plan_tier: 'max',
          status: 'active',
          stripe_customer_id: 'cus-1',
          stripe_subscription_id: 'sub-1',
          stripe_price_id: 'price-1',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date().toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('max');
    });

    it('should allow access when user has enterprise tier', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: {
          id: 'sub-1',
          user_id: 'user-1',
          plan_tier: 'enterprise',
          status: 'active',
          stripe_customer_id: 'cus-1',
          stripe_subscription_id: 'sub-1',
          stripe_price_id: 'price-1',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date().toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('enterprise');
    });
  });

  describe('canUseAPIKeys', () => {
    it('should return false when subscription gate denies access', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: null,
        session: null,
        profile: null,
        subscription: null,
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      expect(canUseAPIKeys()).toBe(false);
    });

    it('should return true when subscription gate allows access', () => {
      vi.mocked(supabaseAuth.getState).mockReturnValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        profile: null,
        subscription: {
          id: 'sub-1',
          user_id: 'user-1',
          plan_tier: 'hobby',
          status: 'active',
          stripe_customer_id: 'cus-1',
          stripe_subscription_id: 'sub-1',
          stripe_price_id: 'price-1',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date().toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        featureFlags: {},
        isLoading: false,
        error: null,
      } as any);

      expect(canUseAPIKeys()).toBe(true);
    });
  });

  describe('getUpgradeMessage', () => {
    it('should return message for free tier', () => {
      expect(getUpgradeMessage('free')).toBe('Subscribe to Hobby plan to unlock AGI Workforce');
    });

    it('should return message for no tier', () => {
      expect(getUpgradeMessage(undefined)).toBe('Subscribe to Hobby plan to unlock AGI Workforce');
    });

    it('should return upgrade message for other tiers', () => {
      expect(getUpgradeMessage('pro')).toBe(
        'Upgrade to Hobby plan or higher to continue using AGI Workforce',
      );
    });
  });
});
