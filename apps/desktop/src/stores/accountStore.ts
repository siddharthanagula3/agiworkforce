/**
 * Account Store
 * Unified account state management for AGI Workforce desktop app
 *
 * This store manages user identity, subscription plan, and feature access.
 * It is designed to work offline with local defaults, and can sync with
 * the web backend when authentication is implemented.
 *
 * See: docs/ACCOUNT_INTEGRATION.md for integration details
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type PlanTier = 'free' | 'pro' | 'enterprise';

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';

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

  // Feature Access
  featureFlags: Record<string, boolean>;

  // Authentication (placeholders for future backend integration)
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
    free: 'Free',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };

  return {
    id: null,
    email: devEmail || null,
    displayName: devName || 'Local User',
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
          free: 'Free',
          pro: 'Pro',
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

      // Auth Actions (stubs)
      login: (tokens: { accessToken: string; refreshToken: string }) => {
        set((state) => ({
          account: {
            ...state.account,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          },
          isAuthenticated: true,
        }));

        // TODO: Fetch user profile from backend
        // await get().syncWithBackend();
      },

      logout: () => {
        set({
          account: getDefaultAccount(),
          isAuthenticated: false,
          isPro: false,
          isEnterprise: false,
        });

        // TODO: Revoke tokens on backend
      },

      syncWithBackend: async () => {
        const { account } = get();
        if (!account.accessToken) {
          console.warn('No access token - skipping backend sync');
          return;
        }

        try {
          // TODO: Implement actual backend sync
          // const profile = await invoke<UserProfile>('fetch_user_profile', {
          //   accessToken: account.accessToken
          // });
          //
          // set({
          //   account: {
          //     ...account,
          //     id: profile.id,
          //     email: profile.email,
          //     displayName: profile.name,
          //     avatar: profile.avatar_url,
          //     plan: profile.plan.tier,
          //     planDisplayName: profile.plan.display_name,
          //     subscriptionStatus: profile.plan.status,
          //     currentPeriodEnd: profile.plan.current_period_end,
          //     featureFlags: profile.feature_flags,
          //     lastSyncedAt: Date.now(),
          //   },
          // });

          console.log('Backend sync - not yet implemented');
        } catch (error) {
          console.error('Failed to sync with backend:', error);
          // Handle auth errors, network errors, etc.
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
 */
export function hasFeature(featureKey: string): boolean {
  const { account, isPro, isEnterprise } = useAccountStore.getState();

  // Check feature flags first
  if (account.featureFlags[featureKey] !== undefined) {
    return account.featureFlags[featureKey];
  }

  // Default feature access based on plan
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
    free: 'Limited automations; Community support',
    pro: 'Unlimited automations; Priority support',
    enterprise: 'Custom solutions; Dedicated support; SSO',
  };

  return descriptions[plan];
}
