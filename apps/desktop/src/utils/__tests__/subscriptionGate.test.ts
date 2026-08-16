/**
 * FIX (audit 2026-05-20, §15 — test-overfit):
 *
 * The old version of this file carried a top-of-file
 * `eslint-disable @typescript-eslint/no-explicit-any` and 13 inline
 * `as any` casts on the mocked `cloudAccountAuth.getState()` return value.
 * Result: any billing-schema drift (new fields on AuthState /
 * Subscription, removed status values) would silently still typecheck
 * even though the production code path could break.
 *
 * Replaced by a typed `makeAuthState(overrides)` helper that builds a
 * real `AuthState` via Partial-merge against a known-good baseline.
 * Adding a required field to `AuthState` now fails the build here, which
 * is exactly the regression signal we want.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkAutoModeAccess,
  checkSubscriptionGate,
  canUseAPIKeys,
  getUpgradeMessage,
} from '../subscriptionGate';
import {
  cloudAccountAuth,
  type AuthState,
  type Session,
  type SubscriptionFetchStatus,
  type User,
} from '../../services/cloudAccountAuth';
vi.mock('../../services/cloudAccountAuth', () => ({
  cloudAccountAuth: {
    getState: vi.fn(),
  },
}));

function makeUser(overrides: Partial<User> = {}): User {
  const base: User = {
    id: 'user-1',
    email: 'test@example.com',
    created_at: new Date().toISOString(),
    user_metadata: {},
  };
  return { ...base, ...overrides };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  const base: Session = {
    access_token: 'token',
    refresh_token: 'refresh',
    user: makeUser(),
  };
  return { ...base, ...overrides };
}

function makeAuthState(overrides: Partial<AuthState> = {}): AuthState {
  const subscriptionFetchStatus: SubscriptionFetchStatus = 'succeeded';
  const base: AuthState = {
    user: null,
    session: null,
    profile: null,
    subscription: null,
    featureFlags: {},
    isLoading: false,
    error: null,
    subscriptionFetchStatus,
  };
  return { ...base, ...overrides };
}

describe('subscriptionGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkSubscriptionGate', () => {
    it('should deny access when user is not authenticated', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: null,
          session: null,
          profile: null,
          subscription: null,
          featureFlags: {},
          isLoading: false,
          error: null,
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('Please sign in to use AGI Workforce');
      expect(result.requiresUpgrade).toBe(false);
    });

    it('should deny access when user has no subscription', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: null,
          featureFlags: {},
          isLoading: false,
          error: null,
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('A subscription is required to use AGI Workforce');
      expect(result.requiresUpgrade).toBe(true);
      expect(result.currentTier).toBe('free');
      expect(result.currentStatus).toBe('none');
    });

    it('should deny access when subscription is canceled', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: {
            id: 'sub-1',
            user_id: 'user-1',
            plan_tier: 'basic',
            status: 'canceled',
            subscription_source: 'stripe',
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
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toContain('canceled');
      expect(result.requiresUpgrade).toBe(true);
      expect(result.currentTier).toBe('basic');
      expect(result.currentStatus).toBe('canceled');
    });

    it('should deny access when subscription is past_due and outside grace period', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 8);

      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: {
            id: 'sub-1',
            user_id: 'user-1',
            plan_tier: 'basic',
            status: 'past_due',
            subscription_source: 'stripe',
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
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toContain('past_due');
      expect(result.requiresUpgrade).toBe(false);
      expect(result.currentTier).toBe('basic');
      expect(result.currentStatus).toBe('past_due');
    });

    it('should fail closed when subscription is past_due even within the former grace period', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 6);

      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: {
            id: 'sub-1',
            user_id: 'user-1',
            plan_tier: 'basic',
            status: 'past_due',
            subscription_source: 'stripe',
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
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toContain('past_due');
      expect(result.currentTier).toBe('basic');
      expect(result.currentStatus).toBe('past_due');
    });

    it('should allow access when user has free tier', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: {
            id: 'sub-1',
            user_id: 'user-1',
            plan_tier: 'free',
            status: 'active',
            subscription_source: 'stripe',
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
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.requiresUpgrade).toBeFalsy();
      expect(result.currentTier).toBe('free');
      expect(result.currentStatus).toBe('active');
    });

    it('should allow access when user has basic tier with active status', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: {
            id: 'sub-1',
            user_id: 'user-1',
            plan_tier: 'basic',
            status: 'active',
            subscription_source: 'stripe',
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
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('basic');
      expect(result.currentStatus).toBe('active');
    });

    it('should allow access when user has basic tier with trialing status', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: {
            id: 'sub-1',
            user_id: 'user-1',
            plan_tier: 'basic',
            status: 'trialing',
            subscription_source: 'stripe',
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
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('basic');
      expect(result.currentStatus).toBe('trialing');
    });

    it('should allow access when user has pro tier', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: {
            id: 'sub-1',
            user_id: 'user-1',
            plan_tier: 'pro',
            status: 'active',
            subscription_source: 'stripe',
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
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('pro');
    });

    it('should allow access when user has max tier', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: {
            id: 'sub-1',
            user_id: 'user-1',
            plan_tier: 'max',
            status: 'active',
            subscription_source: 'stripe',
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
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('max');
    });

    it('should allow access when user has enterprise tier', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: {
            id: 'sub-1',
            user_id: 'user-1',
            plan_tier: 'enterprise',
            status: 'active',
            subscription_source: 'stripe',
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
        }),
      );

      const result = checkSubscriptionGate();

      expect(result.hasAccess).toBe(true);
      expect(result.currentTier).toBe('enterprise');
    });
  });

  describe('canUseAPIKeys', () => {
    it('should return false when subscription gate denies access', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: null,
          session: null,
          profile: null,
          subscription: null,
          featureFlags: {},
          isLoading: false,
          error: null,
        }),
      );

      expect(canUseAPIKeys()).toBe(false);
    });

    it('should return true when subscription gate allows access', () => {
      vi.mocked(cloudAccountAuth.getState).mockReturnValue(
        makeAuthState({
          user: makeUser({ id: 'user-1', email: 'test@example.com' }),
          session: makeSession({ access_token: 'token', refresh_token: 'refresh' }),
          profile: null,
          subscription: {
            id: 'sub-1',
            user_id: 'user-1',
            plan_tier: 'basic',
            status: 'active',
            subscription_source: 'stripe',
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
        }),
      );

      expect(canUseAPIKeys()).toBe(true);
    });
  });

  describe('checkAutoModeAccess', () => {
    it.each(['max_15x', 'team'] as const)(
      'keeps Auto Mode available for the canonical %s tier',
      (planTier) => {
        vi.mocked(cloudAccountAuth.getState).mockReturnValue(
          makeAuthState({
            user: makeUser(),
            session: makeSession(),
            subscription: {
              id: 'sub-1',
              user_id: 'user-1',
              plan_tier: planTier,
              status: 'active',
              subscription_source: 'stripe',
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
          }),
        );

        expect(checkAutoModeAccess()).toMatchObject({
          hasAccess: true,
          currentTier: planTier,
        });
      },
    );
  });

  describe('getUpgradeMessage', () => {
    it('should return message for free tier', () => {
      expect(getUpgradeMessage('free')).toBe('Subscribe to Basic plan to unlock AGI Workforce');
    });

    it('should return message for no tier', () => {
      expect(getUpgradeMessage(undefined)).toBe('Subscribe to Basic plan to unlock AGI Workforce');
    });

    it('should return upgrade message for other tiers', () => {
      expect(getUpgradeMessage('pro')).toBe(
        'Upgrade to Basic plan or higher to continue using AGI Workforce',
      );
    });
  });
});
