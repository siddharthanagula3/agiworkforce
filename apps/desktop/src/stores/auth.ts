/**
 * Unified Auth Store
 *
 * Consolidates authentication, account, and billing state into a single store.
 *
 * Previously split across:
 * - authStore.ts - User login, session validation, auth methods
 * - accountStore.ts - User profile, subscription plan, tier, credits
 * - billingStore.ts - Stripe customer, subscription, credit balance
 *
 * This consolidation:
 * - Reduces state synchronization complexity
 * - Eliminates redundant auth state listeners
 * - Provides a single source of truth for user identity and subscription
 *
 * Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { supabaseAuth } from '../services/supabaseAuth';
import { StripeService, type CustomerInfo, type SubscriptionInfo } from '../services/stripe';
import { subscriptionService, type PlanFeatures } from '../services/subscriptionService';
import { isSubscriptionActive, isInGracePeriod } from '../utils/featureGates';
import { type PlanTier, asPlanTier, PLAN_DISPLAY_NAMES } from '../lib/supabase';
import { cleanupAllStoresOnLogout, clearPersistedUserData } from './logoutCleanup';

// =============================================================================
// Types
// =============================================================================

/**
 * Basic user identity - minimal info needed for auth checks
 */
export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: string;
}

/**
 * Subscription status from Stripe
 */
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'none'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

/**
 * Fetch status for subscription data
 */
export type SubscriptionFetchStatus = 'idle' | 'fetching' | 'succeeded' | 'failed';

/**
 * Credit balance information
 */
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
  daily_reset_at?: string;
}

// Re-export PlanTier for backwards compatibility
export type { PlanTier } from '../lib/supabase';

// =============================================================================
// DesktopAccount Interface (for backwards compatibility)
// =============================================================================

/**
 * Desktop account shape for backwards compatibility with accountStore.
 * New code should use the individual properties on UnifiedAuthStore instead.
 */
interface DesktopAccountShape {
  id: string | null;
  email: string | null;
  displayName: string | null;
  avatar?: string | null;
  plan: PlanTier | null;
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionFetchStatus: SubscriptionFetchStatus;
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

// =============================================================================
// State Interface
// =============================================================================

interface AuthState {
  // ─────────────────────────────────────────────────────────────────────────
  // User Identity (from authStore)
  // ─────────────────────────────────────────────────────────────────────────
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Hydration tracking
  _hasHydrated: boolean;
  // Session has been validated with Supabase (not just rehydrated from cache)
  sessionValidated: boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // Subscription & Plan (merged from accountStore + billingStore)
  // ─────────────────────────────────────────────────────────────────────────
  plan: PlanTier | null; // null = unknown/loading
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionFetchStatus: SubscriptionFetchStatus;
  currentPeriodEnd: number | null;

  // Tier flags (derived from plan)
  isPro: boolean;
  isEnterprise: boolean;

  // Feature flags from backend
  featureFlags: Record<string, boolean>;

  // ─────────────────────────────────────────────────────────────────────────
  // Stripe Integration (from billingStore)
  // ─────────────────────────────────────────────────────────────────────────
  stripeCustomerId: string | null;
  stripeCustomer: CustomerInfo | null;
  stripeSubscription: SubscriptionInfo | null;
  stripeInitialized: boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // Credits (merged from accountStore + billingStore)
  // ─────────────────────────────────────────────────────────────────────────
  credits: CreditBalance | null;
  // For pre-flight checks (from billingStore) - null = not loaded, 0 = confirmed zero
  creditBalance_cents: number | null;
  dailyUsage_cents: number | null;
  dailyLimit_cents: number | null;
  dailyResetAt: string | null;

  // ─────────────────────────────────────────────────────────────────────────
  // Tokens (from accountStore)
  // ─────────────────────────────────────────────────────────────────────────
  accessToken: string | null;
  refreshToken: string | null;

  // ─────────────────────────────────────────────────────────────────────────
  // Device Linking (from accountStore)
  // ─────────────────────────────────────────────────────────────────────────
  deviceLinkId: string | null;
  deviceLinkCode: string | null;

  // ─────────────────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────────────────
  createdAt: number;
  lastSyncedAt: number | null;

  // ─────────────────────────────────────────────────────────────────────────
  // Backwards Compatibility - Computed Properties
  // These provide the same interface as the old separate stores
  // ─────────────────────────────────────────────────────────────────────────
  /** @deprecated Use individual properties instead. Provided for backwards compatibility with accountStore. */
  account: DesktopAccountShape;
  /** @deprecated Use stripeSubscription instead. Provided for backwards compatibility with billingStore. */
  subscription: SubscriptionInfo | null;
  /** @deprecated Use stripeCustomer instead. Provided for backwards compatibility with billingStore. */
  customer: CustomerInfo | null;
}

interface AuthActions {
  // ─────────────────────────────────────────────────────────────────────────
  // Auth Methods (from authStore)
  // ─────────────────────────────────────────────────────────────────────────
  setUser: (user: User | null) => void;
  getCurrentUserId: () => string;
  clearAuth: () => void;
  setHasHydrated: (state: boolean) => void;
  setSessionValidated: (state: boolean) => void;
  isAuthReady: () => boolean;

  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: 'github' | 'google') => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;

  // ─────────────────────────────────────────────────────────────────────────
  // Account Methods (from accountStore)
  // ─────────────────────────────────────────────────────────────────────────
  setAccount: (updates: Partial<AccountUpdates>) => void;
  setPlan: (plan: PlanTier) => void;
  setDisplayName: (name: string) => void;
  setEmail: (email: string) => void;
  setAvatar: (avatarUrl: string | null) => void;
  setFeatureFlag: (flag: string, enabled: boolean) => void;
  login: (tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
  simulatePlan: (plan: PlanTier) => void;

  // ─────────────────────────────────────────────────────────────────────────
  // Billing Methods (from billingStore)
  // ─────────────────────────────────────────────────────────────────────────
  initializeStripe: (stripeApiKey: string, webhookSecret: string) => Promise<void>;
  setStripeCustomer: (customer: CustomerInfo | null) => void;
  fetchCustomerByEmail: (email: string) => Promise<CustomerInfo | null>;
  setStripeSubscription: (subscription: SubscriptionInfo | null) => void;
  fetchActiveSubscription: (customerId: string) => Promise<void>;
  isSubscriptionActive: () => boolean;
  isInGracePeriod: () => boolean;
  getCurrentPlan: () => string;
  updateCredits: (info: {
    remaining_cents: number;
    daily_used?: number;
    daily_limit?: number;
    daily_reset_at?: string;
  }) => void;

  // ─────────────────────────────────────────────────────────────────────────
  // Error Handling
  // ─────────────────────────────────────────────────────────────────────────
  setError: (error: string | null) => void;
  clearError: () => void;

  // ─────────────────────────────────────────────────────────────────────────
  // Reset
  // ─────────────────────────────────────────────────────────────────────────
  reset: () => void;
}

/**
 * Account update fields (subset of state that can be updated via setAccount)
 */
interface AccountUpdates {
  id: string | null;
  email: string | null;
  displayName: string | null;
  avatar: string | null;
  plan: PlanTier | null;
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionFetchStatus: SubscriptionFetchStatus;
  currentPeriodEnd: number | null;
  stripeCustomerId: string | null;
  featureFlags: Record<string, boolean>;
  credits: CreditBalance | null;
  accessToken: string | null;
  refreshToken: string | null;
  deviceLinkId: string | null;
  deviceLinkCode: string | null;
  lastSyncedAt: number | null;
}

type UnifiedAuthStore = AuthState & AuthActions;

// =============================================================================
// Storage & Caching
// =============================================================================

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
const UNIFIED_AUTH_STORE_VERSION = 1;

// Subscription cache for resilience against fetch failures
const SUBSCRIPTION_CACHE_KEY = 'agiworkforce_subscription_cache';
const SUBSCRIPTION_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SubscriptionCache {
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  fetchedAt: number;
  userId: string;
}

function getCachedSubscription(userId: string): SubscriptionCache | null {
  try {
    const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached) as SubscriptionCache;
    if (data.userId === userId && Date.now() - data.fetchedAt < SUBSCRIPTION_CACHE_MAX_AGE_MS) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedSubscription(
  userId: string,
  planTier: PlanTier,
  subscriptionStatus: SubscriptionStatus,
): void {
  try {
    const cache: SubscriptionCache = {
      planTier,
      subscriptionStatus,
      fetchedAt: Date.now(),
      userId,
    };
    localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore localStorage errors
  }
}

function clearCachedSubscription(): void {
  try {
    localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    // Ignore localStorage errors
  }
}

// Credits cache for deduplication
// These are maintained for use by authOrchestrator which handles credit fetching
interface CreditsCacheEntry {
  accessToken: string;
  credits: CreditBalance | null;
  fetchedAt: number;
}
interface Credits401CacheEntry {
  accessToken: string;
  at: number;
}

// Exported for use by authOrchestrator
export let creditsCache: CreditsCacheEntry | null = null;
export let credits401Cache: Credits401CacheEntry | null = null;

function clearCreditsCache(): void {
  creditsCache = null;
  credits401Cache = null;
}

// Retry mechanism for failed subscription fetches
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
const MAX_SUBSCRIPTION_RETRIES = 3;

// Schedule retry is exported for use by authOrchestrator
export function scheduleSubscriptionRetry(userId: string): void {
  if (retryCount >= MAX_SUBSCRIPTION_RETRIES) {
    console.log('[UnifiedAuth] Max subscription retries reached, stopping retries');
    return;
  }

  if (retryTimeout) clearTimeout(retryTimeout);
  retryCount++;

  const delay = Math.min(3000 * Math.pow(2, retryCount - 1), 30000);
  console.log(
    `[UnifiedAuth] Scheduling subscription retry ${retryCount}/${MAX_SUBSCRIPTION_RETRIES} in ${delay}ms`,
  );

  retryTimeout = setTimeout(async () => {
    console.log('[UnifiedAuth] Retrying subscription fetch for user:', userId);
    await supabaseAuth.refreshUserData();
  }, delay);
}

function resetRetryCount(): void {
  retryCount = 0;
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
}

// Sync lock to prevent concurrent syncWithBackend calls
let syncInProgress = false;
let pendingSyncPromise: Promise<void> | null = null;

// =============================================================================
// Default State
// =============================================================================

function getDefaultState(): AuthState {
  const devPlan = import.meta.env.VITE_DEV_ACCOUNT_PLAN as PlanTier | undefined;
  const devName = import.meta.env.VITE_DEV_ACCOUNT_NAME as string | undefined;
  const devEmail = import.meta.env.VITE_DEV_ACCOUNT_EMAIL as string | undefined;

  // In development, use dev plan. In production, start with null (unknown) until fetched.
  const plan: PlanTier | null = devPlan || null;

  return {
    // User identity
    user: devEmail
      ? {
          id: 'dev-user',
          email: devEmail,
          name: devName,
        }
      : null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    _hasHydrated: false,
    sessionValidated: false,

    // Subscription & Plan
    plan,
    planDisplayName: plan ? PLAN_DISPLAY_NAMES[plan] : 'Loading...',
    subscriptionStatus: 'none',
    subscriptionFetchStatus: 'idle',
    currentPeriodEnd: null,
    isPro: false,
    isEnterprise: false,
    featureFlags: {},

    // Stripe
    stripeCustomerId: null,
    stripeCustomer: null,
    stripeSubscription: null,
    stripeInitialized: false,

    // Credits
    credits: null,
    creditBalance_cents: null,
    dailyUsage_cents: null,
    dailyLimit_cents: null,
    dailyResetAt: null,

    // Tokens
    accessToken: null,
    refreshToken: null,

    // Device linking
    deviceLinkId: null,
    deviceLinkCode: null,

    // Metadata
    createdAt: Date.now(),
    lastSyncedAt: null,

    // Backwards compatibility - these mirror other state properties
    // They are computed in the store's subscribeWithSelector middleware
    account: {
      id: devEmail ? 'dev-user' : null,
      email: devEmail || null,
      displayName: devName || null,
      avatar: undefined,
      plan,
      planDisplayName: plan ? PLAN_DISPLAY_NAMES[plan] : 'Loading...',
      subscriptionStatus: 'none' as SubscriptionStatus,
      subscriptionFetchStatus: 'idle' as SubscriptionFetchStatus,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      featureFlags: {},
      credits: null,
      accessToken: null,
      refreshToken: null,
      deviceLinkId: null,
      deviceLinkCode: null,
      createdAt: Date.now(),
      lastSyncedAt: null,
    },
    subscription: null,
    customer: null,
  };
}

// =============================================================================
// Store
// =============================================================================

export const useUnifiedAuthStore = create<UnifiedAuthStore>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        ...getDefaultState(),

        // ═══════════════════════════════════════════════════════════════════
        // Auth Methods (from authStore)
        // ═══════════════════════════════════════════════════════════════════

        setUser: (user: User | null) => {
          set(
            {
              user,
              isAuthenticated: !!user,
              sessionValidated: true,
              error: null,
            },
            undefined,
            'auth/setUser',
          );
        },

        getCurrentUserId: () => {
          const state = get();
          return state.user?.id || '';
        },

        clearAuth: () => {
          set(
            {
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
              sessionValidated: true,
            },
            undefined,
            'auth/clearAuth',
          );
        },

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state }, undefined, 'auth/setHasHydrated');
        },

        setSessionValidated: (state: boolean) => {
          set({ sessionValidated: state }, undefined, 'auth/setSessionValidated');
        },

        isAuthReady: () => {
          const state = get();
          return state._hasHydrated && state.sessionValidated;
        },

        signIn: async (email: string, password: string) => {
          set({ isLoading: true, error: null }, undefined, 'auth/signIn/start');

          try {
            const response = await supabaseAuth.signIn({ email, password });

            if (response.error) {
              set({ error: response.error.message }, undefined, 'auth/signIn/error');
              return { error: response.error.message };
            }

            return { error: null };
          } catch (error) {
            console.error('[UnifiedAuth] Sign in exception:', error);
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message }, undefined, 'auth/signIn/exception');
            return { error: message };
          } finally {
            set({ isLoading: false }, undefined, 'auth/signIn/complete');
          }
        },

        signUp: async (email: string, password: string, name?: string) => {
          set({ isLoading: true, error: null }, undefined, 'auth/signUp/start');

          try {
            const response = await supabaseAuth.signUp({
              email,
              password,
              displayName: name,
            });

            if (response.error) {
              set({ error: response.error.message }, undefined, 'auth/signUp/error');
              return { error: response.error.message };
            }

            return { error: null };
          } catch (error) {
            console.error('[UnifiedAuth] Sign up exception:', error);
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message }, undefined, 'auth/signUp/exception');
            return { error: message };
          } finally {
            set({ isLoading: false }, undefined, 'auth/signUp/complete');
          }
        },

        signOut: async () => {
          set({ isLoading: true }, undefined, 'auth/signOut/start');
          try {
            // Clear sync lock before signOut
            syncInProgress = false;
            pendingSyncPromise = null;

            await supabaseAuth.signOut();

            // Clean up all stores after successful sign out
            cleanupAllStoresOnLogout();
            clearPersistedUserData();
          } catch (error) {
            console.error('[UnifiedAuth] Sign out error:', error);
            // Still attempt cleanup even if sign out fails
            try {
              cleanupAllStoresOnLogout();
              clearPersistedUserData();
            } catch (cleanupError) {
              console.error('[UnifiedAuth] Store cleanup error:', cleanupError);
            }
          } finally {
            // Clear all caches
            clearCachedSubscription();
            clearCreditsCache();
            resetRetryCount();

            set(
              {
                ...getDefaultState(),
                _hasHydrated: true,
                sessionValidated: true,
              },
              undefined,
              'auth/signOut/complete',
            );
          }
        },

        signInWithMagicLink: async (email: string) => {
          set({ isLoading: true, error: null }, undefined, 'auth/signInWithMagicLink/start');

          try {
            const { error } = await supabaseAuth.signInWithMagicLink(email);

            if (error) {
              set({ error: error.message }, undefined, 'auth/signInWithMagicLink/error');
              return { error: error.message };
            }

            return { error: null };
          } catch (error) {
            console.error('[UnifiedAuth] Magic link sign in exception:', error);
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message }, undefined, 'auth/signInWithMagicLink/exception');
            return { error: message };
          } finally {
            set({ isLoading: false }, undefined, 'auth/signInWithMagicLink/complete');
          }
        },

        resetPassword: async (email: string) => {
          set({ isLoading: true, error: null }, undefined, 'auth/resetPassword/start');

          try {
            const { error } = await supabaseAuth.resetPassword(email);

            if (error) {
              set({ error: error.message }, undefined, 'auth/resetPassword/error');
              return { error: error.message };
            }

            return { error: null };
          } catch (error) {
            console.error('[UnifiedAuth] Reset password exception:', error);
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message }, undefined, 'auth/resetPassword/exception');
            return { error: message };
          } finally {
            set({ isLoading: false }, undefined, 'auth/resetPassword/complete');
          }
        },

        signInWithOAuth: async (provider: 'github' | 'google') => {
          set({ isLoading: true, error: null }, undefined, 'auth/signInWithOAuth/start');

          try {
            const { error } = await supabaseAuth.signInWithOAuth(provider);

            if (error) {
              set({ error: error.message }, undefined, 'auth/signInWithOAuth/error');
              return { error: error.message };
            }

            return { error: null };
          } catch (error) {
            console.error(`[UnifiedAuth] OAuth sign in exception (${provider}):`, error);
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message }, undefined, 'auth/signInWithOAuth/exception');
            return { error: message };
          } finally {
            set({ isLoading: false }, undefined, 'auth/signInWithOAuth/complete');
          }
        },

        // ═══════════════════════════════════════════════════════════════════
        // Account Methods (from accountStore)
        // ═══════════════════════════════════════════════════════════════════

        setAccount: (updates: Partial<AccountUpdates>) => {
          set(
            (state) => {
              const newPlan = updates.plan !== undefined ? updates.plan : state.plan;
              const newUser: User | null =
                updates.id !== undefined
                  ? {
                      id: updates.id || '',
                      email: updates.email || state.user?.email || '',
                      name: updates.displayName || state.user?.name,
                      avatar: updates.avatar || state.user?.avatar,
                    }
                  : state.user;

              const newPlanDisplayName =
                updates.planDisplayName !== undefined
                  ? updates.planDisplayName
                  : newPlan
                    ? PLAN_DISPLAY_NAMES[newPlan]
                    : 'Loading...';
              const newSubscriptionStatus =
                updates.subscriptionStatus !== undefined
                  ? updates.subscriptionStatus
                  : state.subscriptionStatus;
              const newSubscriptionFetchStatus =
                updates.subscriptionFetchStatus !== undefined
                  ? updates.subscriptionFetchStatus
                  : state.subscriptionFetchStatus;
              const newCurrentPeriodEnd =
                updates.currentPeriodEnd !== undefined
                  ? updates.currentPeriodEnd
                  : state.currentPeriodEnd;
              const newStripeCustomerId =
                updates.stripeCustomerId !== undefined
                  ? updates.stripeCustomerId
                  : state.stripeCustomerId;
              const newFeatureFlags =
                updates.featureFlags !== undefined ? updates.featureFlags : state.featureFlags;
              const newCredits = updates.credits !== undefined ? updates.credits : state.credits;
              const newAccessToken =
                updates.accessToken !== undefined ? updates.accessToken : state.accessToken;
              const newRefreshToken =
                updates.refreshToken !== undefined ? updates.refreshToken : state.refreshToken;
              const newDeviceLinkId =
                updates.deviceLinkId !== undefined ? updates.deviceLinkId : state.deviceLinkId;
              const newDeviceLinkCode =
                updates.deviceLinkCode !== undefined
                  ? updates.deviceLinkCode
                  : state.deviceLinkCode;
              const newLastSyncedAt =
                updates.lastSyncedAt !== undefined ? updates.lastSyncedAt : state.lastSyncedAt;

              return {
                user: newUser,
                isAuthenticated: !!newUser?.id,
                plan: newPlan,
                planDisplayName: newPlanDisplayName,
                subscriptionStatus: newSubscriptionStatus,
                subscriptionFetchStatus: newSubscriptionFetchStatus,
                currentPeriodEnd: newCurrentPeriodEnd,
                stripeCustomerId: newStripeCustomerId,
                featureFlags: newFeatureFlags,
                credits: newCredits,
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                deviceLinkId: newDeviceLinkId,
                deviceLinkCode: newDeviceLinkCode,
                lastSyncedAt: newLastSyncedAt,
                // Derived tier flags
                isPro:
                  newPlan !== null &&
                  (newPlan === 'hobby' ||
                    newPlan === 'pro' ||
                    newPlan === 'max' ||
                    newPlan === 'enterprise'),
                isEnterprise: newPlan === 'enterprise',
                // Backwards compatibility - update account object
                account: {
                  id: newUser?.id || null,
                  email: newUser?.email || null,
                  displayName: newUser?.name || null,
                  avatar: newUser?.avatar,
                  plan: newPlan,
                  planDisplayName: newPlanDisplayName,
                  subscriptionStatus: newSubscriptionStatus,
                  subscriptionFetchStatus: newSubscriptionFetchStatus,
                  currentPeriodEnd: newCurrentPeriodEnd,
                  stripeCustomerId: newStripeCustomerId,
                  featureFlags: newFeatureFlags,
                  credits: newCredits,
                  accessToken: newAccessToken,
                  refreshToken: newRefreshToken,
                  deviceLinkId: newDeviceLinkId,
                  deviceLinkCode: newDeviceLinkCode,
                  createdAt: state.createdAt,
                  lastSyncedAt: newLastSyncedAt,
                },
              };
            },
            undefined,
            'auth/setAccount',
          );
        },

        setPlan: (plan: PlanTier) => {
          set(
            {
              plan,
              planDisplayName: PLAN_DISPLAY_NAMES[plan],
              subscriptionStatus: plan === 'free' ? 'none' : 'active',
              isPro: plan === 'hobby' || plan === 'pro' || plan === 'max' || plan === 'enterprise',
              isEnterprise: plan === 'enterprise',
            },
            undefined,
            'auth/setPlan',
          );
        },

        setDisplayName: (displayName: string) => {
          set(
            (state) => ({
              user: state.user ? { ...state.user, name: displayName } : null,
            }),
            undefined,
            'auth/setDisplayName',
          );
        },

        setEmail: (email: string) => {
          set(
            (state) => ({
              user: state.user ? { ...state.user, email } : null,
            }),
            undefined,
            'auth/setEmail',
          );
        },

        setAvatar: (avatar: string | null) => {
          set(
            (state) => ({
              user: state.user ? { ...state.user, avatar: avatar || undefined } : null,
            }),
            undefined,
            'auth/setAvatar',
          );
        },

        setFeatureFlag: (flag: string, enabled: boolean) => {
          set(
            (state) => ({
              featureFlags: {
                ...state.featureFlags,
                [flag]: enabled,
              },
            }),
            undefined,
            'auth/setFeatureFlag',
          );
        },

        login: async (tokens: { accessToken: string; refreshToken: string }) => {
          set(
            {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              isAuthenticated: true,
            },
            undefined,
            'auth/login',
          );
        },

        logout: async () => {
          await get().signOut();
        },

        syncWithBackend: async () => {
          // Prevent concurrent sync calls
          if (syncInProgress && pendingSyncPromise) {
            console.log('[UnifiedAuth] Sync already in progress, waiting for existing sync...');
            return pendingSyncPromise;
          }

          syncInProgress = true;
          pendingSyncPromise = (async () => {
            try {
              console.log('[UnifiedAuth] Starting syncWithBackend...');
              await supabaseAuth.refreshUserData();

              const authState = supabaseAuth.getState();
              console.log('[UnifiedAuth] Auth state after refresh:', {
                hasUser: !!authState.user,
                hasSession: !!authState.session,
                planTier: authState.subscription?.plan_tier,
                subscriptionFetchStatus: authState.subscriptionFetchStatus,
              });

              if (!authState.user) {
                console.warn('[UnifiedAuth] No authenticated user - skipping sync');
                return;
              }

              // Determine plan tier with cache fallback
              let planTier: PlanTier | null;
              let fetchStatus: SubscriptionFetchStatus;
              let subscriptionStatus: SubscriptionStatus = 'none';
              const userId = authState.user?.id;

              if (authState.subscription?.plan_tier) {
                planTier = asPlanTier(authState.subscription.plan_tier);
                subscriptionStatus =
                  (authState.subscription.status as SubscriptionStatus) || 'active';
                fetchStatus = 'succeeded';

                if (userId) {
                  setCachedSubscription(userId, planTier, subscriptionStatus);
                  resetRetryCount();
                }
                console.log('[UnifiedAuth] syncWithBackend - Using fetched plan tier:', planTier);
              } else if (userId && authState.subscriptionFetchStatus === 'failed') {
                const cached = getCachedSubscription(userId);
                if (cached) {
                  planTier = cached.planTier;
                  subscriptionStatus = cached.subscriptionStatus;
                  fetchStatus = 'succeeded';
                  console.log('[UnifiedAuth] syncWithBackend - Using cached plan tier:', planTier);
                } else {
                  planTier = null;
                  fetchStatus = 'failed';
                  console.log(
                    '[UnifiedAuth] syncWithBackend - Fetch failed, no cache - showing loading state',
                  );
                }
              } else if (userId && authState.subscriptionFetchStatus === 'succeeded') {
                planTier = 'free';
                fetchStatus = 'succeeded';
                clearCachedSubscription();
                resetRetryCount();
                console.log(
                  '[UnifiedAuth] syncWithBackend - Setting plan to free (confirmed no subscription)',
                );
              } else {
                planTier = null;
                fetchStatus = 'fetching';
                console.log('[UnifiedAuth] syncWithBackend - Plan unknown, showing loading state');
              }

              // Fetch credits from API if we have a session
              let credits: CreditBalance | null = null;
              if (authState.session) {
                try {
                  const { accountApi } = await import('../api/accountApi');
                  const profile = await accountApi.fetchUserProfile(authState.session.access_token);
                  // Normalize credit field names (API returns credits_allocated_cents but we expect allocated_cents)
                  const apiCredits = profile.credits as any;
                  if (apiCredits) {
                    credits = {
                      account_id: apiCredits.account_id,
                      period_start: apiCredits.period_start,
                      period_end: apiCredits.period_end,
                      allocated_cents:
                        apiCredits.allocated_cents ?? apiCredits.credits_allocated_cents,
                      used_cents: apiCredits.used_cents ?? apiCredits.credits_used_cents,
                      remaining_cents:
                        apiCredits.remaining_cents ?? apiCredits.credits_remaining_cents,
                      percentage_used: apiCredits.percentage_used,
                      daily_limit_cents: apiCredits.daily_limit_cents,
                      daily_used_cents: apiCredits.daily_used_cents,
                      daily_remaining_cents: apiCredits.daily_remaining_cents,
                      daily_reset_at: apiCredits.daily_reset_at ?? apiCredits.last_daily_reset_at,
                    };
                  }
                } catch {
                  // Continue without credits
                }
              }

              set(
                {
                  user: {
                    id: authState.user?.id || '',
                    email: authState.user?.email || '',
                    name: authState.profile?.display_name || undefined,
                    avatar: authState.profile?.avatar_url || undefined,
                  },
                  isAuthenticated: true,
                  plan: planTier,
                  planDisplayName: planTier ? PLAN_DISPLAY_NAMES[planTier] : 'Loading...',
                  subscriptionStatus:
                    (authState.subscription?.status as SubscriptionStatus) || 'none',
                  subscriptionFetchStatus: fetchStatus,
                  currentPeriodEnd: authState.subscription?.current_period_end
                    ? new Date(authState.subscription.current_period_end).getTime()
                    : null,
                  stripeCustomerId: authState.subscription?.stripe_customer_id || null,
                  featureFlags: authState.featureFlags,
                  credits,
                  creditBalance_cents: credits?.remaining_cents ?? null,
                  dailyUsage_cents: credits?.daily_used_cents ?? null,
                  dailyLimit_cents: credits?.daily_limit_cents ?? null,
                  dailyResetAt: credits?.daily_reset_at ?? null,
                  lastSyncedAt: Date.now(),
                  isPro:
                    planTier !== null &&
                    (planTier === 'pro' ||
                      planTier === 'max' ||
                      planTier === 'enterprise' ||
                      planTier === 'hobby'),
                  isEnterprise: planTier === 'enterprise',
                },
                undefined,
                'auth/syncWithBackend',
              );
            } catch (error) {
              console.error('Failed to sync with backend:', error);
            } finally {
              syncInProgress = false;
              pendingSyncPromise = null;
            }
          })();

          return pendingSyncPromise;
        },

        simulatePlan: (plan: PlanTier) => {
          get().setPlan(plan);
        },

        // ═══════════════════════════════════════════════════════════════════
        // Billing Methods (from billingStore)
        // ═══════════════════════════════════════════════════════════════════

        initializeStripe: async (stripeApiKey: string, webhookSecret: string) => {
          try {
            await StripeService.initialize(stripeApiKey, webhookSecret);
            set(
              { stripeInitialized: true, error: null },
              undefined,
              'auth/initializeStripe/success',
            );
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Failed to initialize billing';
            set(
              { error: errorMessage, stripeInitialized: false },
              undefined,
              'auth/initializeStripe/error',
            );
            throw error;
          }
        },

        setStripeCustomer: (customer) =>
          set({ stripeCustomer: customer, customer }, undefined, 'auth/setStripeCustomer'),

        fetchCustomerByEmail: async (email: string) => {
          try {
            set({ error: null }, undefined, 'auth/fetchCustomerByEmail/start');
            const customer = await StripeService.getCustomerByEmail(email);
            if (customer) {
              set({ stripeCustomer: customer }, undefined, 'auth/fetchCustomerByEmail/success');
            }
            return customer;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to get customer';
            set({ error: errorMessage }, undefined, 'auth/fetchCustomerByEmail/error');
            throw error;
          }
        },

        setStripeSubscription: (subscription) =>
          set(
            { stripeSubscription: subscription, subscription },
            undefined,
            'auth/setStripeSubscription',
          ),

        fetchActiveSubscription: async (customerId: string) => {
          try {
            set(
              { subscriptionFetchStatus: 'fetching', error: null },
              undefined,
              'auth/fetchActiveSubscription/start',
            );
            const subscription = await StripeService.getActiveSubscription(customerId);
            set(
              { stripeSubscription: subscription, subscriptionFetchStatus: 'succeeded' },
              undefined,
              'auth/fetchActiveSubscription/success',
            );
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Failed to fetch active subscription';
            set(
              { error: errorMessage, subscriptionFetchStatus: 'failed' },
              undefined,
              'auth/fetchActiveSubscription/error',
            );
            throw error;
          }
        },

        isSubscriptionActive: () => {
          const { stripeSubscription } = get();
          return isSubscriptionActive(stripeSubscription);
        },

        isInGracePeriod: () => {
          const { stripeSubscription } = get();
          return isInGracePeriod(stripeSubscription);
        },

        getCurrentPlan: () => {
          const { stripeSubscription, plan } = get();
          return stripeSubscription?.plan_name || plan || 'free';
        },

        updateCredits: (info) => {
          set(
            (state) => ({
              creditBalance_cents: info.remaining_cents,
              dailyUsage_cents: info.daily_used ?? state.dailyUsage_cents ?? 0,
              dailyLimit_cents: info.daily_limit ?? state.dailyLimit_cents ?? 0,
              dailyResetAt: info.daily_reset_at ?? state.dailyResetAt,
              credits: {
                ...state.credits,
                remaining_cents: info.remaining_cents,
                daily_used_cents: info.daily_used,
                daily_limit_cents: info.daily_limit,
                daily_reset_at: info.daily_reset_at,
              },
            }),
            undefined,
            'auth/updateCredits',
          );
        },

        // ═══════════════════════════════════════════════════════════════════
        // Error Handling
        // ═══════════════════════════════════════════════════════════════════

        setError: (error) => set({ error }, undefined, 'auth/setError'),
        clearError: () => set({ error: null }, undefined, 'auth/clearError'),

        // ═══════════════════════════════════════════════════════════════════
        // Reset
        // ═══════════════════════════════════════════════════════════════════

        reset: () => {
          clearCachedSubscription();
          clearCreditsCache();
          resetRetryCount();
          syncInProgress = false;
          pendingSyncPromise = null;

          set(
            {
              ...getDefaultState(),
              _hasHydrated: true,
            },
            undefined,
            'auth/reset',
          );
        },
      })),
      {
        name: 'unified-auth-storage',
        version: UNIFIED_AUTH_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          // Only persist user identity, not subscription or auth state
          // Plan/subscription data should always be fetched fresh from backend
          user: state.user
            ? {
                id: state.user.id,
                email: state.user.email,
                name: state.user.name,
                avatar: state.user.avatar,
              }
            : null,
          isAuthenticated: state.isAuthenticated,
          lastSyncedAt: state.lastSyncedAt,
          // Persist credit balance for offline/restart continuity
          creditBalance_cents: state.creditBalance_cents,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            console.log('[UnifiedAuth] Rehydration complete, waiting for session validation...');
          }
        },
        migrate: (persistedState: unknown, version: number) => {
          if (version === 0) {
            return persistedState as UnifiedAuthStore;
          }
          return persistedState as UnifiedAuthStore;
        },
      },
    ),
    { name: 'UnifiedAuthStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Initialization
// =============================================================================

export function initializeUnifiedAuthStore(): () => void {
  const unsubscribe = supabaseAuth.onAuthStateChange((authState) => {
    const store = useUnifiedAuthStore.getState();

    if (authState.user) {
      store.setUser({
        id: authState.user.id,
        email: authState.user.email || '',
        name:
          authState.profile?.display_name ||
          (authState.user.user_metadata?.['full_name'] as string),
        avatar:
          authState.profile?.avatar_url || (authState.user.user_metadata?.['avatar_url'] as string),
      });
    } else if (!authState.isLoading) {
      store.clearAuth();
    }
  });

  return unsubscribe;
}

// =============================================================================
// Selectors
// =============================================================================

// Auth selectors (from authStore)
export const selectIsAuthReady = (state: UnifiedAuthStore): boolean =>
  state._hasHydrated && state.sessionValidated;

export const selectUser = (state: UnifiedAuthStore) => state.user;
export const selectIsAuthenticated = (state: UnifiedAuthStore) => state.isAuthenticated;
export const selectIsLoading = (state: UnifiedAuthStore) => state.isLoading;
export const selectAuthError = (state: UnifiedAuthStore) => state.error;

// Account selectors (from accountStore)
export const selectAccount = (state: UnifiedAuthStore) => ({
  id: state.user?.id || null,
  email: state.user?.email || null,
  displayName: state.user?.name || null,
  avatar: state.user?.avatar || null,
  plan: state.plan,
  planDisplayName: state.planDisplayName,
  subscriptionStatus: state.subscriptionStatus,
  subscriptionFetchStatus: state.subscriptionFetchStatus,
  currentPeriodEnd: state.currentPeriodEnd,
  stripeCustomerId: state.stripeCustomerId,
  featureFlags: state.featureFlags,
  credits: state.credits,
  accessToken: state.accessToken,
  refreshToken: state.refreshToken,
  deviceLinkId: state.deviceLinkId,
  deviceLinkCode: state.deviceLinkCode,
  createdAt: state.createdAt,
  lastSyncedAt: state.lastSyncedAt,
});
export const selectPlan = (state: UnifiedAuthStore) => state.plan;
export const selectPlanDisplayName = (state: UnifiedAuthStore) => state.planDisplayName;
export const selectSubscriptionFetchStatus = (state: UnifiedAuthStore) =>
  state.subscriptionFetchStatus;
export const selectIsPro = (state: UnifiedAuthStore) => state.isPro;
export const selectIsEnterprise = (state: UnifiedAuthStore) => state.isEnterprise;
export const selectDisplayName = (state: UnifiedAuthStore) => state.user?.name || null;
export const selectEmail = (state: UnifiedAuthStore) => state.user?.email || null;
export const selectAvatar = (state: UnifiedAuthStore) => state.user?.avatar || null;
export const selectFeatureFlags = (state: UnifiedAuthStore) => state.featureFlags;
export const selectIsTierLoading = (state: UnifiedAuthStore) =>
  state.plan === null || state.subscriptionFetchStatus === 'fetching';

// Billing selectors (from billingStore)
export const selectStripeCustomer = (state: UnifiedAuthStore) => state.stripeCustomer;
export const selectStripeSubscription = (state: UnifiedAuthStore) => state.stripeSubscription;
export const selectCreditBalance = (state: UnifiedAuthStore) => state.creditBalance_cents;
export const selectIsHydrated = (state: UnifiedAuthStore) => state._hasHydrated;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Wait for auth state to be fully ready (hydrated + session validated).
 */
export function waitForAuthReady(): Promise<void> {
  return new Promise((resolve) => {
    const state = useUnifiedAuthStore.getState();
    if (state._hasHydrated && state.sessionValidated) {
      resolve();
      return;
    }
    const unsub = useUnifiedAuthStore.subscribe((s) => {
      if (s._hasHydrated && s.sessionValidated) {
        unsub();
        resolve();
      }
    });
  });
}

/**
 * Wait for store hydration from localStorage
 */
export function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (useUnifiedAuthStore.getState()._hasHydrated) {
      resolve();
      return;
    }
    const unsub = useUnifiedAuthStore.subscribe((state) => {
      if (state._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}

/**
 * Wait for billing store hydration (alias for waitForHydration for backwards compatibility)
 */
export const waitForBillingHydration = waitForHydration;

/**
 * Check if user has a specific feature
 */
export function hasFeature(featureKey: string): boolean {
  const { featureFlags, isPro, isEnterprise } = useUnifiedAuthStore.getState();

  if (featureFlags[featureKey] !== undefined) {
    return featureFlags[featureKey]!;
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

/**
 * Get description for a plan tier
 */
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

/**
 * Cleanup function for the unified auth store.
 */
export function cleanupUnifiedAuthStore(): void {
  resetRetryCount();
  clearCachedSubscription();
  clearCreditsCache();
  syncInProgress = false;
  pendingSyncPromise = null;
}

// =============================================================================
// Backwards Compatibility - Re-exports
// =============================================================================

// Re-export the unified store with old names for backwards compatibility
export const useAuthStore = useUnifiedAuthStore;
export const useAccountStore = useUnifiedAuthStore;
export const useBillingStore = useUnifiedAuthStore;

// Re-export initialization functions
export const initializeAuthStore = initializeUnifiedAuthStore;
export const initializeAccountStore = initializeUnifiedAuthStore;
export const initializeBillingStore = initializeUnifiedAuthStore;

// Re-export cleanup function with old name
export const cleanupAccountStore = cleanupUnifiedAuthStore;

// Billing-specific selectors mapped to unified store
export const selectCustomer = selectStripeCustomer;
export const selectSubscription = selectStripeSubscription;

// Type exports for backwards compatibility
export type { CustomerInfo, SubscriptionInfo } from '../services/stripe';

// DesktopAccount type for backwards compatibility
export interface DesktopAccount {
  id: string | null;
  email: string | null;
  displayName: string | null;
  avatar?: string | null;
  plan: PlanTier | null;
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionFetchStatus: SubscriptionFetchStatus;
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

// Check session on load (browser only)
if (typeof window !== 'undefined') {
  supabaseAuth.checkSession();
}
