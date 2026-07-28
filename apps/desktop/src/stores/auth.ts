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
import { storageFallback } from '../lib/storageFallback';
import { cloudAccountAuth } from '../services/cloudAccountAuth';
import type { CustomerInfo, SubscriptionInfo } from '../types/billing';
import { PLAN_FEATURES, type PlanFeatures } from '../constants/planFeatures';
import { type PlanTier, PLAN_DISPLAY_NAMES } from '../lib/cloudAccountTypes';
import { isFreePlan, normalizeUIPlanTier, PLAN_DESCRIPTION } from '@agiworkforce/types';

// =============================================================================
// Helpers
// =============================================================================

export function isPaidCloudPlan(plan: PlanTier | null): boolean {
  return plan !== null && !isFreePlan(normalizeUIPlanTier(plan));
}

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
export type { PlanTier } from '../lib/cloudAccountTypes';

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
  // Session has been validated with the cloud auth boundary (not just rehydrated from cache)
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
  signOut: () => Promise<void>;

  // ─────────────────────────────────────────────────────────────────────────
  // Account Methods (from accountStore)
  // ─────────────────────────────────────────────────────────────────────────
  setAccount: (updates: Partial<AccountUpdates>) => void;
  setPlan: (plan: PlanTier) => void;
  setDisplayName: (name: string) => void;
  setEmail: (email: string) => void;
  setAvatar: (avatarUrl: string | null) => void;
  setFeatureFlag: (flag: string, enabled: boolean) => void;
  logout: () => Promise<void>;

  // ─────────────────────────────────────────────────────────────────────────
  // Billing Methods (from billingStore)
  //
  // Customer/subscription records are populated by the cloud auth
  // orchestrator from the web `/api/auth/me` response. Checkout, portal, and
  // cancellation route through the web REST API (`lib/stripeCheckout.ts`).
  // The desktop client never holds Stripe secrets or talks to Stripe directly.
  // ─────────────────────────────────────────────────────────────────────────
  setStripeCustomer: (customer: CustomerInfo | null) => void;
  setStripeSubscription: (subscription: SubscriptionInfo | null) => void;
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

// storageFallback is imported from '../lib/storageFallback'

// Version for storage migration
const UNIFIED_AUTH_STORE_VERSION = 1;

// Legacy cache key retained only so sign-out/reset can erase stale pre-v1 data.
const SUBSCRIPTION_CACHE_KEY = 'agiworkforce_subscription_cache';

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
    return;
  }

  if (retryTimeout) clearTimeout(retryTimeout);
  retryCount++;

  const delay = Math.min(3000 * Math.pow(2, retryCount - 1), 30000);

  retryTimeout = setTimeout(async () => {
    // [C2 fix] Guard: skip retry if the active session has changed since scheduling
    const currentUserId = useUnifiedAuthStore.getState().user?.id;
    if (currentUserId && currentUserId !== userId) {
      return;
    }
    await cloudAccountAuth.refreshUserData();
  }, delay);
}

function resetRetryCount(): void {
  retryCount = 0;
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
}

async function runLogoutCleanup(): Promise<void> {
  const { cleanupAllStoresOnLogout, clearPersistedUserData } = await import('./logoutCleanup');
  cleanupAllStoresOnLogout();
  clearPersistedUserData();
}

async function disposeAuthenticatedChatRuntime(): Promise<void> {
  const { disposeActiveDesktopChatRuntime } = await import('../runtime/desktopChatRuntime');
  await disposeActiveDesktopChatRuntime();
}

async function closeAuthenticatedChildWindows(): Promise<void> {
  const { closeOwnedCloudWebviewWindows } = await import('../services/ownedWebviewWindow');
  await closeOwnedCloudWebviewWindows();
}

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
    isPro: isPaidCloudPlan(plan),
    isEnterprise: plan === 'enterprise',
    featureFlags: {},

    // Stripe
    stripeCustomerId: null,
    stripeCustomer: null,
    stripeSubscription: null,

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
              plan: null,
              planDisplayName: 'Loading...',
              subscriptionStatus: 'none',
              subscriptionFetchStatus: 'idle',
              currentPeriodEnd: null,
              isPro: false,
              isEnterprise: false,
              featureFlags: {},
              stripeCustomerId: null,
              stripeCustomer: null,
              stripeSubscription: null,
              credits: null,
              creditBalance_cents: null,
              dailyUsage_cents: null,
              dailyLimit_cents: null,
              dailyResetAt: null,
              accessToken: null,
              refreshToken: null,
              deviceLinkId: null,
              deviceLinkCode: null,
              lastSyncedAt: null,
              account: {
                id: null,
                email: null,
                displayName: null,
                avatar: null,
                plan: null,
                planDisplayName: 'Loading...',
                subscriptionStatus: 'none',
                subscriptionFetchStatus: 'idle',
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
            const response = await cloudAccountAuth.signIn({ email, password });

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

        signOut: async () => {
          set({ isLoading: true }, undefined, 'auth/signOut/start');
          try {
            // Abort and cancel managed work while its bearer credential is
            // still available. Replacing the runtime after auth is cleared is
            // too late: the orphaned instance could otherwise persist or emit
            // into the next account boundary.
            await disposeAuthenticatedChatRuntime().catch((error: unknown) => {
              console.warn('[UnifiedAuth] Could not fully dispose the active chat runtime:', error);
            });
            await closeAuthenticatedChildWindows().catch((error: unknown) => {
              console.warn('[UnifiedAuth] Could not close every Cloud child window:', error);
            });
            await cloudAccountAuth.signOut();

            // Clean up all stores after successful sign out
            await runLogoutCleanup();
          } catch (error) {
            console.error('[UnifiedAuth] Sign out error:', error);
            // Still attempt cleanup even if sign out fails
            try {
              await runLogoutCleanup();
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
                isPro: isPaidCloudPlan(newPlan),
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
              isPro: isPaidCloudPlan(plan),
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

        logout: async () => {
          await get().signOut();
        },

        // ═══════════════════════════════════════════════════════════════════
        // Billing Methods (from billingStore)
        //
        // Subscription/customer records are set by the cloud auth orchestrator
        // from the web `/api/auth/me` response — the desktop never queries
        // Stripe directly. Checkout/portal/cancel go through the web REST API
        // (`lib/stripeCheckout.ts`). No Stripe secrets live on the client.
        // ═══════════════════════════════════════════════════════════════════

        setStripeCustomer: (customer) =>
          set({ stripeCustomer: customer, customer }, undefined, 'auth/setStripeCustomer'),

        setStripeSubscription: (subscription) =>
          set(
            { stripeSubscription: subscription, subscription },
            undefined,
            'auth/setStripeSubscription',
          ),

        getCurrentPlan: () => {
          const { plan } = get();
          return plan || 'free';
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
          // Persist only non-secret identity hints. Authentication, billing,
          // entitlements, and credits are account-scoped server state and must
          // be revalidated from the native credential vault on every launch.
          user: state.user
            ? {
                id: state.user.id,
                email: state.user.email,
                name: state.user.name,
                avatar: state.user.avatar,
              }
            : null,
          lastSyncedAt: state.lastSyncedAt,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
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
// Selectors
// =============================================================================

// Auth selectors (from authStore)
export const selectIsAuthReady = (state: UnifiedAuthStore): boolean =>
  state._hasHydrated && state.sessionValidated;

export const selectUser = (state: UnifiedAuthStore) => state.user;
export const selectIsAuthenticated = (state: UnifiedAuthStore) => state.isAuthenticated;
/**
 * THE single desktop answer to "does this install have a usable Managed Cloud
 * session?". Every cloud-gated surface (sidebar account row, Tasks, Library,
 * Settings > Account/Privacy/Billing/General, the app shell, cloud chat/project
 * loading, sync, and the managed egress boundary) must derive from this and
 * nothing else — four hand-rolled variants are what let the same session render
 * as signed-in and signed-out at once.
 *
 * Identity is `user.id`, NOT `user.email`: the desktop bearer is minted by
 * /api/auth/device/token with `email: ''` when the browser approval had no
 * email claim, so an email conjunct silently signs valid paying sessions out.
 * The credential is the token; the tenant is the id. `plan !== 'local-only'`
 * keeps the synthesized Local account out of the Managed Cloud boundary.
 */
export const selectHasCloudAccountSession = (state: UnifiedAuthStore): boolean =>
  state.isAuthenticated &&
  state.plan !== 'local-only' &&
  Boolean(state.user?.id) &&
  Boolean(state.accessToken);
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
  const { featureFlags, plan } = useUnifiedAuthStore.getState();

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
    return Boolean(PLAN_FEATURES[plan ?? 'free'][mappedFeature]);
  }

  if (featureKey === 'unlimited_automations') {
    return PLAN_FEATURES[plan ?? 'free'].automationsPerDay === 'unlimited';
  }

  return true;
}

/**
 * Get description for a plan tier
 */
export function getPlanDescription(plan: PlanTier): string {
  return PLAN_DESCRIPTION[normalizeUIPlanTier(plan)];
}

/**
 * Cleanup function for the unified auth store.
 */
export function cleanupUnifiedAuthStore(): void {
  resetRetryCount();
  clearCachedSubscription();
  clearCreditsCache();
}

// =============================================================================
// Backwards Compatibility - Re-exports
// =============================================================================

// Re-export the unified store with old names for backwards compatibility
export const useAuthStore = useUnifiedAuthStore;
export const useAccountStore = useUnifiedAuthStore;
export const useBillingStore = useUnifiedAuthStore;

// Re-export cleanup function with old name
export const cleanupAccountStore = cleanupUnifiedAuthStore;

// Billing-specific selectors mapped to unified store
export const selectCustomer = selectStripeCustomer;
export const selectSubscription = selectStripeSubscription;

// Type exports for backwards compatibility
export type { CustomerInfo, SubscriptionInfo } from '../types/billing';

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
