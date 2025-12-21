/**
 * Account Store
 * Unified account state management for AGI Workforce desktop app
 *
 * This store manages user identity, subscription plan, and feature access.
 * It integrates with Supabase Auth and syncs subscription data from the database.
 *
 * See: docs/ACCOUNT_INTEGRATION.md for integration details
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabaseAuth, type AuthState } from '../services/supabaseAuth';
import { subscriptionService, type PlanFeatures } from '../services/subscriptionService';
import { type PlanTier, asPlanTier, PLAN_DISPLAY_NAMES } from '../lib/supabase';

// Re-export PlanTier for backwards compatibility
export type { PlanTier } from '../lib/supabase';

// ============================================================================
// Types
// ============================================================================

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'none'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export interface DesktopAccount {
  // Identity
  id: string | null;
  email: string | null;
  displayName: string | null;
  avatar?: string | null;

  // Subscription
  plan: PlanTier;
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null; // Unix timestamp
  stripeCustomerId?: string | null;

  // Feature Access
  featureFlags: Record<string, boolean>;

  // Authentication (managed by Supabase)
  accessToken?: string | null;
  refreshToken?: string | null;
  deviceLinkId?: string | null;
  deviceLinkCode?: string | null;

  // Metadata
  createdAt: number;
  lastSyncedAt: number | null;
}

interface AccountState {
  // Account data
  account: DesktopAccount;

  // Computed flags
  isAuthenticated: boolean;
  isPro: boolean;
  isEnterprise: boolean;

  // Actions
  setAccount: (account: Partial<DesktopAccount>) => void;
  setPlan: (plan: PlanTier) => void;
  setDisplayName: (name: string) => void;
  setEmail: (email: string) => void;
  setAvatar: (avatarUrl: string | null) => void;
  setFeatureFlag: (flag: string, enabled: boolean) => void;

  // Auth actions (stubs for future implementation)
  login: (tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  syncWithBackend: () => Promise<void>;

  // Dev helpers
  simulatePlan: (plan: PlanTier) => void;

  // Reset
  reset: () => void;
}

// ============================================================================
// Default Values
// ============================================================================

const getDefaultAccount = (): DesktopAccount => {
  // Check for dev mode overrides
  const devPlan = import.meta.env.VITE_DEV_ACCOUNT_PLAN as PlanTier | undefined;
  const devName = import.meta.env.VITE_DEV_ACCOUNT_NAME;
  const devEmail = import.meta.env.VITE_DEV_ACCOUNT_EMAIL;

  const plan: PlanTier = devPlan || 'free';
  const planDisplayNames: Record<PlanTier, string> = {
    hobby: 'Hobby',
    free: 'Free',
    pro: 'Pro',
    max: 'Max',
    enterprise: 'Enterprise',
  };

  return {
    id: null,
    email: devEmail || null,
    displayName: devName || null,
    avatar: null,
    plan,
    planDisplayName: planDisplayNames[plan],
    subscriptionStatus: plan === 'free' ? 'none' : 'active',
    currentPeriodEnd: null,
    featureFlags: {},
    accessToken: null,
    refreshToken: null,
    deviceLinkId: null,
    deviceLinkCode: null,
    createdAt: Date.now(),
    lastSyncedAt: null,
  };
};

// ============================================================================
// Store
// ============================================================================

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      // Initial State
      account: getDefaultAccount(),
      isAuthenticated: false,
      isPro: false,
      isEnterprise: false,

      // Actions
      setAccount: (updates: Partial<DesktopAccount>) => {
        set((state) => {
          const updatedAccount = { ...state.account, ...updates };
          return {
            account: updatedAccount,
            isPro: updatedAccount.plan === 'pro' || updatedAccount.plan === 'enterprise',
            isEnterprise: updatedAccount.plan === 'enterprise',
          };
        });
      },

      setPlan: (plan: PlanTier) => {
        const planDisplayNames: Record<PlanTier, string> = {
          hobby: 'Hobby',
          free: 'Free',
          pro: 'Pro',
          max: 'Max',
          enterprise: 'Enterprise',
        };

        set((state) => ({
          account: {
            ...state.account,
            plan,
            planDisplayName: planDisplayNames[plan],
            subscriptionStatus: plan === 'free' ? 'none' : 'active',
          },
          isPro: plan === 'pro' || plan === 'enterprise',
          isEnterprise: plan === 'enterprise',
        }));
      },

      setDisplayName: (displayName: string) => {
        set((state) => ({
          account: {
            ...state.account,
            displayName,
          },
        }));
      },

      setEmail: (email: string) => {
        set((state) => ({
          account: {
            ...state.account,
            email,
          },
        }));
      },

      setAvatar: (avatar: string | null) => {
        set((state) => ({
          account: {
            ...state.account,
            avatar,
          },
        }));
      },

      setFeatureFlag: (flag: string, enabled: boolean) => {
        set((state) => ({
          account: {
            ...state.account,
            featureFlags: {
              ...state.account.featureFlags,
              [flag]: enabled,
            },
          },
        }));
      },

      // Auth Actions - Now using Supabase Auth
      login: async (tokens: { accessToken: string; refreshToken: string }) => {
        // This is now handled by Supabase Auth - tokens are managed automatically
        // The auth state listener will update the store
        set((state) => ({
          account: {
            ...state.account,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          },
          isAuthenticated: true,
        }));
      },

      logout: async () => {
        // Sign out via Supabase Auth
        await supabaseAuth.signOut();

        set({
          account: getDefaultAccount(),
          isAuthenticated: false,
          isPro: false,
          isEnterprise: false,
        });
      },

      syncWithBackend: async () => {
        // Sync is now handled by Supabase Auth service
        // This refreshes user data from the database
        await supabaseAuth.refreshUserData();

        const authState = supabaseAuth.getState();

        if (!authState.user) {
          console.warn('No authenticated user - skipping sync');
          return;
        }

        try {
          const planTier = asPlanTier(authState.subscription?.plan_tier);

          set((state) => ({
            account: {
              ...state.account,
              id: authState.user?.id || null,
              email: authState.user?.email || null,
              displayName: authState.profile?.display_name || null,
              avatar: authState.profile?.avatar_url || null,
              plan: planTier,
              planDisplayName: PLAN_DISPLAY_NAMES[planTier],
              subscriptionStatus: (authState.subscription?.status as SubscriptionStatus) || 'none',
              currentPeriodEnd: authState.subscription?.current_period_end
                ? new Date(authState.subscription.current_period_end).getTime()
                : null,
              stripeCustomerId: authState.subscription?.stripe_customer_id || null,
              featureFlags: authState.featureFlags,
              lastSyncedAt: Date.now(),
            },
            isAuthenticated: true,
            isPro: planTier === 'pro' || planTier === 'enterprise',
            isEnterprise: planTier === 'enterprise',
          }));
        } catch (error) {
          console.error('Failed to sync with backend:', error);
        }
      },

      // Dev Helpers
      simulatePlan: (plan: PlanTier) => {
        get().setPlan(plan);
      },

      // Reset
      reset: () => {
        set({
          account: getDefaultAccount(),
          isAuthenticated: false,
          isPro: false,
          isEnterprise: false,
        });
      },
    }),
    {
      name: 'account-storage',
      partialize: (state) => ({
        account: {
          ...state.account,
          // Don't persist tokens in localStorage (security risk)
          // In production, use Windows Credential Manager
          accessToken: null,
          refreshToken: null,
        },
      }),
    },
  ),
);

// ============================================================================
// Selectors
// ============================================================================

export const selectAccount = (state: AccountState) => state.account;
export const selectPlan = (state: AccountState) => state.account.plan;
export const selectPlanDisplayName = (state: AccountState) => state.account.planDisplayName;
export const selectIsAuthenticated = (state: AccountState) => state.isAuthenticated;
export const selectIsPro = (state: AccountState) => state.isPro;
export const selectIsEnterprise = (state: AccountState) => state.isEnterprise;
export const selectDisplayName = (state: AccountState) => state.account.displayName;
export const selectEmail = (state: AccountState) => state.account.email;
export const selectAvatar = (state: AccountState) => state.account.avatar;
export const selectFeatureFlags = (state: AccountState) => state.account.featureFlags;

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if a feature is enabled for the current account
 * Uses the subscription service for feature access checks
 */
export function hasFeature(featureKey: string): boolean {
  const { account, isPro, isEnterprise } = useAccountStore.getState();

  // Check feature flags first (can override plan-based access)
  if (account.featureFlags[featureKey] !== undefined) {
    return account.featureFlags[featureKey];
  }

  // Use subscription service for plan-based feature checks
  const featureMap: Record<string, keyof PlanFeatures> = {
    unlimited_automations: 'automationsPerDay',
    browser_automation: 'browserAutomation',
    advanced_ui_automation: 'advancedUiAutomation',
    email_support: 'emailSupport',
    llm_cost_tracking: 'llmCostTracking',
    team_features: 'teamFeatures',
    sso: 'sso',
    priority_support: 'prioritySupport',
    custom_workflows: 'customWorkflows',
    webhook_integration: 'webhookIntegration',
    analytics: 'analytics',
  };

  const mappedFeature = featureMap[featureKey];
  if (mappedFeature) {
    return subscriptionService.hasFeatureAccess(mappedFeature);
  }

  // Legacy fallback for unmapped features
  const proFeatures = [
    'unlimited_automations',
    'browser_automation',
    'advanced_ui_automation',
    'email_support',
    'llm_cost_tracking',
  ];

  const enterpriseFeatures = [
    'team_features',
    'sso',
    'priority_support',
    'custom_workflows',
    'webhook_integration',
    'analytics',
  ];

  if (enterpriseFeatures.includes(featureKey)) {
    return isEnterprise;
  }

  if (proFeatures.includes(featureKey)) {
    return isPro || isEnterprise;
  }

  // Free tier has access to everything else
  return true;
}

/**
 * Get human-readable plan description
 */
export function getPlanDescription(plan: PlanTier): string {
  const descriptions: Record<PlanTier, string> = {
    hobby: 'Perfect for getting started; 3-month free trial; $10/month',
    free: 'Limited automations; Community support',
    pro: 'Unlimited automations; Priority support',
    max: 'Maximum performance; $300/mo credits; Dedicated support',
    enterprise: 'Custom solutions; Dedicated support; SSO',
  };

  return descriptions[plan];
}

// ============================================================================
// Supabase Auth Integration
// ============================================================================

/**
 * Initialize account store with Supabase Auth listener
 * This sets up automatic syncing when auth state changes
 */
export function initializeAccountStore(): () => void {
  // Subscribe to auth state changes
  const unsubscribe = supabaseAuth.onAuthStateChange((authState: AuthState) => {
    const store = useAccountStore.getState();

    if (authState.user && authState.session) {
      // User is signed in - sync their data
      const planTier = asPlanTier(authState.subscription?.plan_tier);

      store.setAccount({
        id: authState.user.id,
        email: authState.user.email || null,
        displayName:
          authState.profile?.display_name ||
          (authState.user.user_metadata?.['full_name'] as string) ||
          null,
        avatar:
          authState.profile?.avatar_url ||
          (authState.user.user_metadata?.['avatar_url'] as string) ||
          null,
        plan: planTier,
        planDisplayName: PLAN_DISPLAY_NAMES[planTier],
        subscriptionStatus: (authState.subscription?.status as SubscriptionStatus) || 'none',
        currentPeriodEnd: authState.subscription?.current_period_end
          ? new Date(authState.subscription.current_period_end).getTime()
          : null,
        stripeCustomerId: authState.subscription?.stripe_customer_id || null,
        featureFlags: authState.featureFlags,
        accessToken: authState.session.access_token,
        refreshToken: authState.session.refresh_token,
        lastSyncedAt: Date.now(),
      });
    } else if (!authState.user && !authState.isLoading) {
      // User signed out
      store.reset();
    }
  });

  return unsubscribe;
}
