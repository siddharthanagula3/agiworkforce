/**
 * Account Store
 *
 * Manages user account state including authentication, plan tier, and credits.
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { supabaseAuth, type AuthState } from '../services/supabaseAuth';
import { subscriptionService, type PlanFeatures } from '../services/subscriptionService';
import { type PlanTier, asPlanTier, PLAN_DISPLAY_NAMES } from '../lib/supabase';
import { accountApi } from '../api/accountApi';

const isTauri = !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

export type { PlanTier } from '../lib/supabase';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'none'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export interface CreditBalance {
  account_id?: string;
  period_start?: string;
  period_end?: string;
  allocated_cents?: number;
  used_cents?: number;
  remaining_cents?: number;
  percentage_used?: number;
  daily_limit_cents?: number;
  daily_used_cents?: number;
  daily_remaining_cents?: number;
  daily_reset_at?: string; // ISO timestamp
}

export interface DesktopAccount {
  id: string | null;
  email: string | null;
  displayName: string | null;
  avatar?: string | null;

  plan: PlanTier;
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null;
  stripeCustomerId?: string | null;

  featureFlags: Record<string, boolean>;
  credits?: CreditBalance | null;

  accessToken?: string | null;
  refreshToken?: string | null;
  deviceLinkId?: string | null;
  deviceLinkCode?: string | null;

  createdAt: number;
  lastSyncedAt: number | null;
}

interface AccountState {
  account: DesktopAccount;

  isAuthenticated: boolean;
  isPro: boolean;
  isEnterprise: boolean;
  _hasHydrated: boolean;

  setAccount: (account: Partial<DesktopAccount>) => void;
  setPlan: (plan: PlanTier) => void;
  setDisplayName: (name: string) => void;
  setEmail: (email: string) => void;
  setAvatar: (avatarUrl: string | null) => void;
  setFeatureFlag: (flag: string, enabled: boolean) => void;

  login: (tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  syncWithBackend: () => Promise<void>;

  simulatePlan: (plan: PlanTier) => void;

  reset: () => void;
}

const getDefaultAccount = (): DesktopAccount => {
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

// Storage fallback for SSR/non-browser environments
const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

// Version for storage migration
const ACCOUNT_STORE_VERSION = 1;

export const useAccountStore = create<AccountState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        account: getDefaultAccount(),
        isAuthenticated: false,
        isPro: false,
        isEnterprise: false,
        _hasHydrated: false,

        setAccount: (updates: Partial<DesktopAccount>) => {
          set((state) => {
            const updatedAccount = { ...state.account, ...updates };
            const plan = updatedAccount.plan;
            return {
              account: updatedAccount,
              isPro: plan === 'hobby' || plan === 'pro' || plan === 'max' || plan === 'enterprise',
              isEnterprise: plan === 'enterprise',
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
              subscriptionStatus: plan === 'free' || plan === ('none' as any) ? 'none' : 'active',
            },
            isPro: plan === 'hobby' || plan === 'pro' || plan === 'max' || plan === 'enterprise',
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

        login: async (tokens: { accessToken: string; refreshToken: string }) => {
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
          await supabaseAuth.signOut();

          set({
            account: getDefaultAccount(),
            isAuthenticated: false,
            isPro: false,
            isEnterprise: false,
          });
        },

        syncWithBackend: async () => {
          console.log('[Account] Starting syncWithBackend...');
          await supabaseAuth.refreshUserData();

          const authState = supabaseAuth.getState();
          console.log('[Account] Auth state after refresh:', {
            hasUser: !!authState.user,
            hasSession: !!authState.session,
            subscription: authState.subscription,
            planTier: authState.subscription?.plan_tier,
          });

          if (!authState.user) {
            console.warn('[Account] No authenticated user - skipping sync');
            return;
          }

          try {
            // Determine plan tier - ALWAYS use fetched subscription data
            // If fetch failed, force to free tier for security (prevents stale subscription abuse)
            let planTier: PlanTier;
            if (authState.subscription?.plan_tier) {
              planTier = asPlanTier(authState.subscription.plan_tier);
              console.log('[Account] syncWithBackend - Using fetched plan tier:', planTier);
            } else {
              // Subscription fetch failed or returned null - force to free tier for security
              // This prevents users from retaining paid features after subscription cancellation
              // The UI will prompt them to refresh if this is a temporary network issue
              planTier = 'free';
              console.log(
                '[Account] syncWithBackend - Forcing free tier (subscription fetch failed or no subscription found)',
              );
            }

            // Fetch credits from API if we have a session
            let credits: CreditBalance | null = null;
            if (authState.session) {
              try {
                const profile = await accountApi.fetchUserProfile(authState.session.access_token);
                credits = profile.credits || null;
              } catch (error) {
                console.warn('[Account] Failed to fetch credits:', error);
                // Continue without credits - not critical
              }
            }

            set((state) => ({
              account: {
                ...state.account,
                id: authState.user?.id || null,
                email: authState.user?.email || null,
                displayName: authState.profile?.display_name || null,
                avatar: authState.profile?.avatar_url || null,
                plan: planTier,
                planDisplayName: PLAN_DISPLAY_NAMES[planTier],
                subscriptionStatus:
                  (authState.subscription?.status as SubscriptionStatus) || 'none',
                currentPeriodEnd: authState.subscription?.current_period_end
                  ? new Date(authState.subscription.current_period_end).getTime()
                  : null,
                stripeCustomerId: authState.subscription?.stripe_customer_id || null,
                featureFlags: authState.featureFlags,
                credits,
                lastSyncedAt: Date.now(),
              },
              isAuthenticated: true,
              isPro:
                planTier === 'pro' ||
                planTier === 'max' ||
                planTier === 'enterprise' ||
                planTier === 'hobby',
              isEnterprise: planTier === 'enterprise',
            }));

            // Sync credits to billing store for pre-flight credit checks
            if (credits) {
              const { useBillingStore } = await import('./billingStore');
              useBillingStore.getState().updateCredits({
                remaining_cents: credits.remaining_cents ?? 0,
                daily_used: credits.daily_used_cents,
                daily_limit: credits.daily_limit_cents,
                daily_reset_at: credits.daily_reset_at,
              });
              console.log('[Account] Synced credits to billing store:', credits.remaining_cents);
            }
          } catch (error) {
            console.error('Failed to sync with backend:', error);
          }
        },

        simulatePlan: (plan: PlanTier) => {
          get().setPlan(plan);
        },

        reset: () => {
          set({
            account: getDefaultAccount(),
            isAuthenticated: false,
            isPro: false,
            isEnterprise: false,
          });
        },
      })),
      {
        name: 'account-storage',
        version: ACCOUNT_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          // Only persist non-subscription fields to avoid stale plan data on reload
          // Plan/subscription data should always be fetched fresh from backend
          account: {
            id: state.account.id,
            email: state.account.email,
            displayName: state.account.displayName,
            avatar: state.account.avatar,
            lastSyncedAt: state.account.lastSyncedAt,
            // DO NOT persist: plan, planDisplayName, subscriptionStatus, currentPeriodEnd,
            // stripeCustomerId, credits, accessToken, refreshToken, featureFlags
            // These must be fetched fresh from the backend on each app start
            // featureFlags should NOT be persisted to ensure they are cleared on logout
            // and refreshed on next login
          },
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            state._hasHydrated = true;
          }
        },
        migrate: (persistedState: unknown, version: number) => {
          // Migration logic for future schema changes
          if (version === 0) {
            return persistedState as AccountState;
          }
          return persistedState as AccountState;
        },
      },
    ),
    { name: 'AccountStore', enabled: process.env['NODE_ENV'] === 'development' },
  ),
);

// Helper to wait for store hydration from localStorage
export function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (useAccountStore.getState()._hasHydrated) {
      resolve();
      return;
    }
    const unsub = useAccountStore.subscribe((state) => {
      if (state._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}

// Retry mechanism for failed subscription fetches
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleSubscriptionRetry(userId: string): void {
  if (retryTimeout) clearTimeout(retryTimeout);
  retryTimeout = setTimeout(async () => {
    console.log('[Account] Retrying subscription fetch for user:', userId);
    await supabaseAuth.refreshUserData();
  }, 3000);
}

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

export function hasFeature(featureKey: string): boolean {
  const { account, isPro, isEnterprise } = useAccountStore.getState();

  if (account.featureFlags[featureKey] !== undefined) {
    return account.featureFlags[featureKey]!;
  }

  const featureMap: Record<string, keyof PlanFeatures> = {
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

  return true;
}

export function getPlanDescription(plan: PlanTier): string {
  const descriptions: Record<PlanTier, string> = {
    hobby:
      'Perfect for getting started; 3-month free trial with BETATESTER code; $1/mo cloud credits; $10/month',
    free: 'Limited automations; Community support',
    pro: 'Unlimited automations; Priority support',
    max: 'Maximum performance; $250/mo credits; Dedicated support',
    enterprise: 'Custom solutions; Dedicated support; SSO',
  };

  return descriptions[plan];
}

export function initializeAccountStore(): () => void {
  const unsubscribe = supabaseAuth.onAuthStateChange(async (authState: AuthState) => {
    // Skip updates while auth is still loading - subscription data may not be fetched yet
    if (authState.isLoading) {
      console.log('[Account] Auth state is loading, skipping update...');
      return;
    }

    // Skip updates while subscription is still being fetched
    if (authState.subscriptionFetchStatus === 'fetching') {
      console.log('[Account] Subscription is still being fetched, waiting...');
      return;
    }

    // Wait for store hydration from localStorage before making plan decisions
    await waitForHydration();

    const store = useAccountStore.getState();

    if (authState.user && authState.session) {
      // Determine plan tier based on subscription fetch status
      let planTier: PlanTier;
      const { subscriptionFetchStatus } = authState;

      if (authState.subscription?.plan_tier) {
        // We have fresh subscription data from Supabase
        planTier = asPlanTier(authState.subscription.plan_tier);
        console.log(
          '[Account] Using fetched plan tier:',
          planTier,
          '(status:',
          subscriptionFetchStatus,
          ')',
        );
      } else if (subscriptionFetchStatus === 'failed') {
        // Fetch failed - force to free tier for security (prevents stale subscription abuse)
        // Schedule retry to recover if this is a temporary network issue
        planTier = 'free';
        console.log('[Account] Forcing free tier for security (fetch failed, scheduling retry)');
        scheduleSubscriptionRetry(authState.user.id);
      } else {
        // subscriptionFetchStatus === 'succeeded' but no subscription data = genuinely free tier
        planTier = 'free';
        console.log('[Account] Setting plan to free (no subscription found, user is on free tier)');
      }

      // Fetch credits from API if we have a session
      let credits: CreditBalance | null = null;
      if (authState.session) {
        try {
          const profile = await accountApi.fetchUserProfile(authState.session.access_token);
          credits = profile.credits || null;
        } catch (error) {
          console.warn('[Account] Failed to fetch credits on auth change:', error);
        }
      }

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
        credits,
        accessToken: authState.session.access_token,
        refreshToken: authState.session.refresh_token,
        lastSyncedAt: Date.now(),
      });

      // Sync credits to billing store for pre-flight credit checks
      if (credits) {
        const { useBillingStore } = await import('./billingStore');
        useBillingStore.getState().updateCredits({
          remaining_cents: credits.remaining_cents ?? 0,
          daily_used: credits.daily_used_cents,
          daily_limit: credits.daily_limit_cents,
          daily_reset_at: credits.daily_reset_at,
        });
        console.log(
          '[Account] Synced credits to billing store on auth change:',
          credits.remaining_cents,
        );
      }

      // Sync access token to Rust backend keyring for ManagedCloud provider
      // Auto-initialize ManagedCloud provider if user is authenticated
      // This ensures it's available for Pro/Max users who prefer cloud credits
      if (isTauri && authState.session) {
        (async () => {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            // First sync the access token to the Rust backend
            await invoke('account_store_access_token', {
              accessToken: authState.session!.access_token,
            });
            // Sync refresh token if available
            if (authState.session!.refresh_token) {
              await invoke('account_store_refresh_token', {
                refreshToken: authState.session!.refresh_token,
              });
            }
            // Now ensure ManagedCloud provider is initialized
            await invoke('llm_ensure_managed_cloud');
            console.log('[Account] Access token synced and ManagedCloud provider initialized');
          } catch (error) {
            console.warn('[Account] Failed to sync token or ensure ManagedCloud provider:', error);
          }
        })();
      }
    } else if (!authState.user && !authState.isLoading) {
      store.reset();
    }
  });

  return unsubscribe;
}
