import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import { cloudAccountAuth } from '../services/cloudAccountAuth';
import type { CustomerInfo, SubscriptionInfo } from '../types/billing';
import {
  type PlanTier,
  PLAN_DISPLAY_NAMES,
  type SubscriptionSource,
} from '../lib/cloudAccountTypes';
import { isFreePlan, normalizeUIPlanTier, PLAN_DESCRIPTION } from '@agiworkforce/types';

export function isPaidCloudPlan(plan: PlanTier | null): boolean {
  return plan !== null && !isFreePlan(normalizeUIPlanTier(plan));
}

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: string;
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'none'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export type SubscriptionFetchStatus = 'idle' | 'fetching' | 'succeeded' | 'failed';

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

export type { PlanTier } from '../lib/cloudAccountTypes';

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
  subscriptionCancelAtPeriodEnd: boolean;
  subscriptionSource: SubscriptionSource;
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

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  _hasHydrated: boolean;
  sessionValidated: boolean;
  isLocalDeviceAccount: boolean;

  cloudSessionEpoch: number;

  plan: PlanTier | null;
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionFetchStatus: SubscriptionFetchStatus;
  currentPeriodEnd: number | null;
  subscriptionCancelAtPeriodEnd: boolean;
  subscriptionSource: SubscriptionSource;

  isPro: boolean;
  isEnterprise: boolean;

  featureFlags: Record<string, boolean>;

  stripeCustomerId: string | null;
  stripeCustomer: CustomerInfo | null;
  stripeSubscription: SubscriptionInfo | null;

  credits: CreditBalance | null;
  creditBalance_cents: number | null;
  dailyUsage_cents: number | null;
  dailyLimit_cents: number | null;
  dailyResetAt: string | null;

  accessToken: string | null;
  refreshToken: string | null;

  deviceLinkId: string | null;
  deviceLinkCode: string | null;

  createdAt: number;
  lastSyncedAt: number | null;

  /** @deprecated Use individual properties instead. Provided for backwards compatibility with accountStore. */
  account: DesktopAccountShape;
  /** @deprecated Use stripeSubscription instead. Provided for backwards compatibility with billingStore. */
  subscription: SubscriptionInfo | null;
  /** @deprecated Use stripeCustomer instead. Provided for backwards compatibility with billingStore. */
  customer: CustomerInfo | null;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  getCurrentUserId: () => string;
  clearAuth: () => void;
  setHasHydrated: (state: boolean) => void;
  setSessionValidated: (state: boolean) => void;
  isAuthReady: () => boolean;

  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  completeNativeSignIn: (credential: {
    accessToken: string;
    refreshToken?: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;

  setAccount: (updates: Partial<AccountUpdates>) => void;
  setPlan: (plan: PlanTier) => void;
  setDisplayName: (name: string) => void;
  setEmail: (email: string) => void;
  setAvatar: (avatarUrl: string | null) => void;
  logout: () => Promise<void>;

  setStripeCustomer: (customer: CustomerInfo | null) => void;
  setStripeSubscription: (subscription: SubscriptionInfo | null) => void;
  getCurrentPlan: () => string;
  updateCredits: (info: {
    remaining_cents: number;
    daily_used?: number;
    daily_limit?: number;
    daily_reset_at?: string;
  }) => void;

  setError: (error: string | null) => void;
  clearError: () => void;

  reset: () => void;
}

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
  subscriptionCancelAtPeriodEnd: boolean;
  subscriptionSource: SubscriptionSource;
  stripeCustomerId: string | null;
  featureFlags: Record<string, boolean>;
  credits: CreditBalance | null;
  accessToken: string | null;
  refreshToken: string | null;
  deviceLinkId: string | null;
  deviceLinkCode: string | null;
  lastSyncedAt: number | null;
  isLocalDeviceAccount: boolean;
}

type UnifiedAuthStore = AuthState & AuthActions;

const UNIFIED_AUTH_STORE_VERSION = 1;

const SUBSCRIPTION_CACHE_KEY = 'agiworkforce_subscription_cache';

function clearCachedSubscription(): void {
  try {
    localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    // Ignore localStorage errors
  }
}

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

let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
let authAttemptGeneration = 0;
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

async function runLogoutCleanup(isStillSignedOut: () => boolean = () => true): Promise<void> {
  const { cleanupAllStoresOnLogout, clearPersistedUserData } = await import('./logoutCleanup');
  if (!isStillSignedOut()) return;
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

function getDefaultState(): AuthState {
  const devPlan = import.meta.env.VITE_DEV_ACCOUNT_PLAN as PlanTier | undefined;
  const devName = import.meta.env.VITE_DEV_ACCOUNT_NAME as string | undefined;
  const devEmail = import.meta.env.VITE_DEV_ACCOUNT_EMAIL as string | undefined;

  const plan: PlanTier | null = devPlan || null;

  return {
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
    isLocalDeviceAccount: false,
    cloudSessionEpoch: 0,

    plan,
    planDisplayName: plan ? PLAN_DISPLAY_NAMES[plan] : 'Loading...',
    subscriptionStatus: 'none',
    subscriptionFetchStatus: 'idle',
    currentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    subscriptionSource: 'unknown',
    isPro: isPaidCloudPlan(plan),
    isEnterprise: plan === 'enterprise',
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

    createdAt: Date.now(),
    lastSyncedAt: null,

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
      subscriptionCancelAtPeriodEnd: false,
      subscriptionSource: 'unknown',
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

export const useUnifiedAuthStore = create<UnifiedAuthStore>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        ...getDefaultState(),

        setUser: (user: User | null) => {
          set(
            (state) => {
              const previousUserId = state.user?.id ?? null;
              const nextUserId = user?.id ?? null;
              const identityChanged = previousUserId !== nextUserId;

              if (!identityChanged) {
                return {
                  user,
                  isAuthenticated: !!user,
                  isLoading: false,
                  sessionValidated: true,
                  error: null,
                };
              }

              return {
                user,
                isAuthenticated: !!user,
                isLoading: false,
                isLocalDeviceAccount: false,
                cloudSessionEpoch: state.cloudSessionEpoch + 1,
                sessionValidated: true,
                error: null,
                plan: null,
                planDisplayName: 'Loading...',
                subscriptionStatus: 'none' as SubscriptionStatus,
                subscriptionFetchStatus: 'idle' as SubscriptionFetchStatus,
                currentPeriodEnd: null,
                subscriptionCancelAtPeriodEnd: false,
                subscriptionSource: 'unknown' as SubscriptionSource,
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
                  id: nextUserId,
                  email: user?.email ?? null,
                  displayName: user?.name ?? null,
                  avatar: user?.avatar,
                  plan: null,
                  planDisplayName: 'Loading...',
                  subscriptionStatus: 'none' as SubscriptionStatus,
                  subscriptionFetchStatus: 'idle' as SubscriptionFetchStatus,
                  currentPeriodEnd: null,
                  subscriptionCancelAtPeriodEnd: false,
                  subscriptionSource: 'unknown' as SubscriptionSource,
                  stripeCustomerId: null,
                  featureFlags: {},
                  credits: null,
                  accessToken: null,
                  refreshToken: null,
                  deviceLinkId: null,
                  deviceLinkCode: null,
                  createdAt: state.createdAt,
                  lastSyncedAt: null,
                },
                subscription: null,
                customer: null,
              };
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
            (state) => ({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
              sessionValidated: true,
              isLocalDeviceAccount: false,
              cloudSessionEpoch: state.cloudSessionEpoch + 1,
              plan: null,
              planDisplayName: 'Loading...',
              subscriptionStatus: 'none',
              subscriptionFetchStatus: 'idle',
              currentPeriodEnd: null,
              subscriptionCancelAtPeriodEnd: false,
              subscriptionSource: 'unknown',
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
                subscriptionCancelAtPeriodEnd: false,
                subscriptionSource: 'unknown',
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
            }),
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
          const attemptGeneration = ++authAttemptGeneration;
          set({ isLoading: true, error: null }, undefined, 'auth/signIn/start');

          try {
            const response = await cloudAccountAuth.signIn({ email, password });

            if (response.error) {
              if (authAttemptGeneration === attemptGeneration) {
                set({ error: response.error.message }, undefined, 'auth/signIn/error');
              }
              return { error: response.error.message };
            }

            return { error: null };
          } catch (error) {
            console.error('[UnifiedAuth] Sign in exception:', error);
            const message = error instanceof Error ? error.message : String(error);
            if (authAttemptGeneration === attemptGeneration) {
              set({ error: message }, undefined, 'auth/signIn/exception');
            }
            return { error: message };
          } finally {
            if (authAttemptGeneration === attemptGeneration) {
              set({ isLoading: false }, undefined, 'auth/signIn/complete');
            }
          }
        },

        completeNativeSignIn: async (credential: {
          accessToken: string;
          refreshToken?: string;
        }) => {
          const attemptGeneration = ++authAttemptGeneration;
          set({ isLoading: true, error: null }, undefined, 'auth/nativeSignIn/start');

          try {
            const response = await cloudAccountAuth.adoptNativeCredential(credential);

            if (response.error) {
              if (authAttemptGeneration === attemptGeneration) {
                set({ error: response.error.message }, undefined, 'auth/nativeSignIn/error');
              }
              return { error: response.error.message };
            }

            return { error: null };
          } catch (error) {
            console.error('[UnifiedAuth] Native sign-in exception:', error);
            const message = error instanceof Error ? error.message : String(error);
            if (authAttemptGeneration === attemptGeneration) {
              set({ error: message }, undefined, 'auth/nativeSignIn/exception');
            }
            return { error: message };
          } finally {
            if (authAttemptGeneration === attemptGeneration) {
              set({ isLoading: false }, undefined, 'auth/nativeSignIn/complete');
            }
          }
        },

        signOut: async () => {
          authAttemptGeneration += 1;
          const sessionEpochAtStart = get().cloudSessionEpoch;
          set(
            (state) => ({
              isLoading: true,
              isAuthenticated: false,
              cloudSessionEpoch: state.cloudSessionEpoch + 1,
            }),
            undefined,
            'auth/signOut/start',
          );
          const cloudSignOutPromise = cloudAccountAuth.signOut({
            beforeCredentialRevocation: async () => {
              await disposeAuthenticatedChatRuntime().catch((error: unknown) => {
                console.warn(
                  '[UnifiedAuth] Could not fully dispose the active chat runtime:',
                  error,
                );
              });
            },
          });
          const hasReplacementCloudSession = () => cloudAccountAuth.getSession() !== null;
          const isStillSignedOut = () =>
            !hasReplacementCloudSession() && !selectHasCloudAccountSession(get());
          try {
            await cloudSignOutPromise;
            if (hasReplacementCloudSession()) return;
            await closeAuthenticatedChildWindows().catch((error: unknown) => {
              console.warn('[UnifiedAuth] Could not close every Cloud child window:', error);
            });
            if (hasReplacementCloudSession()) return;
            await runLogoutCleanup(isStillSignedOut);
          } catch (error) {
            console.error('[UnifiedAuth] Sign out error:', error);
            try {
              await runLogoutCleanup(isStillSignedOut);
            } catch (cleanupError) {
              console.error('[UnifiedAuth] Store cleanup error:', cleanupError);
            }
          } finally {
            if (isStillSignedOut()) {
              clearCachedSubscription();
              clearCreditsCache();
              resetRetryCount();

              set(
                (state) => ({
                  ...getDefaultState(),
                  _hasHydrated: true,
                  sessionValidated: true,
                  cloudSessionEpoch: Math.max(state.cloudSessionEpoch, sessionEpochAtStart + 1),
                }),
                undefined,
                'auth/signOut/complete',
              );
            }
          }
        },

        setAccount: (updates: Partial<AccountUpdates>) => {
          set(
            (state) => {
              const previousUserId = state.user?.id ?? null;
              const requestedUserId =
                updates.id !== undefined ? updates.id || null : previousUserId;
              const identityChanged =
                updates.id !== undefined && requestedUserId !== previousUserId;
              const previousUser = identityChanged ? null : state.user;
              const newPlan =
                updates.plan !== undefined ? updates.plan : identityChanged ? null : state.plan;
              const newUser: User | null =
                updates.id !== undefined
                  ? requestedUserId
                    ? {
                        id: requestedUserId,
                        email: updates.email ?? previousUser?.email ?? '',
                        name: updates.displayName ?? previousUser?.name,
                        avatar: updates.avatar ?? previousUser?.avatar,
                      }
                    : null
                  : state.user;

              const newSubscriptionStatus =
                updates.subscriptionStatus !== undefined
                  ? updates.subscriptionStatus
                  : identityChanged
                    ? 'none'
                    : state.subscriptionStatus;
              const newSubscriptionFetchStatus =
                updates.subscriptionFetchStatus !== undefined
                  ? updates.subscriptionFetchStatus
                  : identityChanged
                    ? 'idle'
                    : state.subscriptionFetchStatus;
              const newPlanDisplayName =
                updates.planDisplayName !== undefined
                  ? updates.planDisplayName
                  : newPlan
                    ? PLAN_DISPLAY_NAMES[newPlan]
                    : newSubscriptionFetchStatus === 'failed'
                      ? 'Plan unavailable'
                      : 'Loading...';
              const newCurrentPeriodEnd =
                updates.currentPeriodEnd !== undefined
                  ? updates.currentPeriodEnd
                  : identityChanged
                    ? null
                    : state.currentPeriodEnd;
              const newSubscriptionCancelAtPeriodEnd =
                updates.subscriptionCancelAtPeriodEnd !== undefined
                  ? updates.subscriptionCancelAtPeriodEnd
                  : identityChanged
                    ? false
                    : state.subscriptionCancelAtPeriodEnd;
              const newSubscriptionSource =
                updates.subscriptionSource !== undefined
                  ? updates.subscriptionSource
                  : identityChanged
                    ? 'unknown'
                    : state.subscriptionSource;
              const newStripeCustomerId =
                updates.stripeCustomerId !== undefined
                  ? updates.stripeCustomerId
                  : identityChanged
                    ? null
                    : state.stripeCustomerId;
              const newFeatureFlags =
                updates.featureFlags !== undefined
                  ? updates.featureFlags
                  : identityChanged
                    ? {}
                    : state.featureFlags;
              const newCredits =
                updates.credits !== undefined
                  ? updates.credits
                  : identityChanged
                    ? null
                    : state.credits;
              const newAccessToken =
                updates.accessToken !== undefined
                  ? updates.accessToken
                  : identityChanged
                    ? null
                    : state.accessToken;
              const newRefreshToken =
                updates.refreshToken !== undefined
                  ? updates.refreshToken
                  : identityChanged
                    ? null
                    : state.refreshToken;
              const newDeviceLinkId =
                updates.deviceLinkId !== undefined
                  ? updates.deviceLinkId
                  : identityChanged
                    ? null
                    : state.deviceLinkId;
              const newDeviceLinkCode =
                updates.deviceLinkCode !== undefined
                  ? updates.deviceLinkCode
                  : identityChanged
                    ? null
                    : state.deviceLinkCode;
              const newLastSyncedAt =
                updates.lastSyncedAt !== undefined
                  ? updates.lastSyncedAt
                  : identityChanged
                    ? null
                    : state.lastSyncedAt;
              const newIsLocalDeviceAccount =
                updates.isLocalDeviceAccount !== undefined
                  ? updates.isLocalDeviceAccount
                  : identityChanged
                    ? false
                    : state.isLocalDeviceAccount;

              return {
                user: newUser,
                isAuthenticated: !!newUser?.id,
                isLocalDeviceAccount: newIsLocalDeviceAccount,
                ...(identityChanged
                  ? {
                      cloudSessionEpoch: state.cloudSessionEpoch + 1,
                      stripeCustomer: null,
                      stripeSubscription: null,
                      creditBalance_cents: null,
                      dailyUsage_cents: null,
                      dailyLimit_cents: null,
                      dailyResetAt: null,
                      subscription: null,
                      customer: null,
                    }
                  : {}),
                plan: newPlan,
                planDisplayName: newPlanDisplayName,
                subscriptionStatus: newSubscriptionStatus,
                subscriptionFetchStatus: newSubscriptionFetchStatus,
                currentPeriodEnd: newCurrentPeriodEnd,
                subscriptionCancelAtPeriodEnd: newSubscriptionCancelAtPeriodEnd,
                subscriptionSource: newSubscriptionSource,
                stripeCustomerId: newStripeCustomerId,
                featureFlags: newFeatureFlags,
                credits: newCredits,
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                deviceLinkId: newDeviceLinkId,
                deviceLinkCode: newDeviceLinkCode,
                lastSyncedAt: newLastSyncedAt,
                isPro: isPaidCloudPlan(newPlan),
                isEnterprise: newPlan === 'enterprise',
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
                  subscriptionCancelAtPeriodEnd: newSubscriptionCancelAtPeriodEnd,
                  subscriptionSource: newSubscriptionSource,
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

        logout: async () => {
          await get().signOut();
        },

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

        setError: (error) => set({ error }, undefined, 'auth/setError'),
        clearError: () => set({ error: null }, undefined, 'auth/clearError'),

        reset: () => {
          clearCachedSubscription();
          clearCreditsCache();
          resetRetryCount();

          set(
            (state) => ({
              ...getDefaultState(),
              _hasHydrated: true,
              cloudSessionEpoch: state.cloudSessionEpoch + 1,
            }),
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

export const selectIsAuthReady = (state: UnifiedAuthStore): boolean =>
  state._hasHydrated && state.sessionValidated;

export const selectUser = (state: UnifiedAuthStore) => state.user;
export const selectIsAuthenticated = (state: UnifiedAuthStore) => state.isAuthenticated;
export const selectHasCloudAccountSession = (state: UnifiedAuthStore): boolean =>
  state.isAuthenticated &&
  !state.isLocalDeviceAccount &&
  Boolean(state.user?.id) &&
  Boolean(state.accessToken);
export const selectIsLoading = (state: UnifiedAuthStore) => state.isLoading;
export const selectAuthError = (state: UnifiedAuthStore) => state.error;

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
  subscriptionCancelAtPeriodEnd: state.subscriptionCancelAtPeriodEnd,
  subscriptionSource: state.subscriptionSource,
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

export const selectStripeCustomer = (state: UnifiedAuthStore) => state.stripeCustomer;
export const selectStripeSubscription = (state: UnifiedAuthStore) => state.stripeSubscription;
export const selectCreditBalance = (state: UnifiedAuthStore) => state.creditBalance_cents;
export const selectIsHydrated = (state: UnifiedAuthStore) => state._hasHydrated;

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

export const waitForBillingHydration = waitForHydration;

export function getPlanDescription(plan: PlanTier): string {
  return PLAN_DESCRIPTION[normalizeUIPlanTier(plan)];
}

export function cleanupUnifiedAuthStore(): void {
  resetRetryCount();
  clearCachedSubscription();
  clearCreditsCache();
}

export const useAuthStore = useUnifiedAuthStore;
export const useAccountStore = useUnifiedAuthStore;
export const useBillingStore = useUnifiedAuthStore;

export const cleanupAccountStore = cleanupUnifiedAuthStore;

export const selectCustomer = selectStripeCustomer;
export const selectSubscription = selectStripeSubscription;

export type { CustomerInfo, SubscriptionInfo } from '../types/billing';

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
  subscriptionCancelAtPeriodEnd: boolean;
  subscriptionSource: SubscriptionSource;
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
