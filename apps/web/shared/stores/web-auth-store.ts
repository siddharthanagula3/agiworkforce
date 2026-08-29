'use client';

import { create } from 'zustand';
import { parseMeResponse, type MeSubscriptionSource } from '@agiworkforce/cloud-contracts';
import { normalizeBillingPlanTier, type BillingPlanTier } from '@agiworkforce/types';
import {
  hasClerkSessionCookie,
  hasUsableClerkSessionToken,
  subscribeToClerkSessionChange,
} from '@/lib/clerk-session';
import { requestMe } from '@shared/services/me-request';

export interface UserProfileSummary {
  display_name: string | null;
  preferred_name: string | null;
  work_description: string | null;
}

export interface User {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string | null;
  profile?: UserProfileSummary;
  [key: string]: unknown;
}

export interface SubscriptionPlan {
  tier: BillingPlanTier;
  display_name: string;
  status: string;
  current_period_end: number | null;
  cancel_at_period_end?: boolean;
  plan_name: string;
  subscription_source?: MeSubscriptionSource;
}

export interface FeatureFlags {
  advanced_model_access: boolean;
  code_execution?: boolean;
  generic_web_search?: boolean;
}

export interface AuthState {
  user: User | null;
  subscription: SubscriptionPlan | null;
  featureFlags: FeatureFlags | null;
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  unauthenticated: boolean;

  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
  _reset: () => void;
}

const INITIAL_STATE: Omit<AuthState, 'refreshUser' | 'signOut' | '_reset'> = {
  user: null,
  subscription: null,
  featureFlags: null,
  isLoading: true,
  error: null,
  initialized: false,
  unauthenticated: false,
};

let refreshInFlight = false;

export const useBillingStore = create<AuthState>()((set) => ({
  ...INITIAL_STATE,

  refreshUser: async () => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      set({ isLoading: true, error: null });
      try {
        const response = await requestMe();

        if (!response.ok) {
          if (response.status === 401) {
            set({
              user: null,
              subscription: null,
              featureFlags: null,
              isLoading: false,
              initialized: true,
              unauthenticated: true,
            });
            return;
          }
          throw new Error(`/api/me returned ${response.status}`);
        }

        const data = parseMeResponse(await response.json());
        const tier = normalizeBillingPlanTier(data.plan.tier);
        const plan: SubscriptionPlan = {
          tier,
          display_name: data.plan.display_name,
          status: data.plan.status,
          current_period_end: data.plan.current_period_end,
          cancel_at_period_end: data.plan.cancel_at_period_end ?? false,
          plan_name: data.plan.display_name,
          ...(data.plan.subscription_source
            ? { subscription_source: data.plan.subscription_source }
            : {}),
        };

        const user: User = {
          id: data.id,
          ...(data.email ? { email: data.email } : {}),
          ...(data.name ? { name: data.name } : {}),
          avatar_url: data.avatar_url,
          profile: {
            display_name: data.profile?.display_name ?? null,
            preferred_name: data.profile?.preferred_name ?? null,
            work_description: data.profile?.work_description ?? null,
          },
        };

        set({
          user,
          subscription: plan,
          featureFlags: data.feature_flags,
          isLoading: false,
          error: null,
          initialized: true,
          unauthenticated: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ isLoading: false, error: message, initialized: true });
      }
    } finally {
      refreshInFlight = false;
    }
  },

  signOut: async () => {
    try {
      const windowWithClerk = window as unknown as Record<string, unknown>;
      if (typeof window !== 'undefined' && windowWithClerk['Clerk']) {
        const clerkInstance = windowWithClerk['Clerk'] as { signOut?: () => Promise<void> };
        await clerkInstance.signOut?.();
      }
    } catch {
      // Clerk not available or already signed out - proceed with local cleanup
    }
    try {
      const { cleanupAllStores } = await import('@shared/stores/authentication-store');
      await cleanupAllStores();
    } catch (error) {
      console.error('[Auth] store cleanup during signOut failed:', error);
    }
    set({ ...INITIAL_STATE, isLoading: false, initialized: true });
    if (typeof window !== 'undefined') {
      window.location.assign(new URL('/login', window.location.origin));
    }
  },

  _reset: () => {
    set({ ...INITIAL_STATE, isLoading: false, initialized: true });
  },
}));

if (typeof window !== 'undefined') {
  if (hasClerkSessionCookie() && hasUsableClerkSessionToken()) {
    useBillingStore
      .getState()
      .refreshUser()
      .then(() => {
        const isInit = useBillingStore.getState().initialized;
        if (!isInit) {
          useBillingStore.setState({ isLoading: false, initialized: true });
        }
      });
  } else {
    useBillingStore.getState()._reset();
  }

  let lastBootstrapCookie = hasClerkSessionCookie();
  subscribeToClerkSessionChange(() => {
    const signedIn = hasClerkSessionCookie();
    const wasSignedIn = lastBootstrapCookie;
    lastBootstrapCookie = signedIn;
    if (signedIn) {
      const needsUser = !wasSignedIn || useBillingStore.getState().user === null;
      if (needsUser && hasUsableClerkSessionToken()) {
        void useBillingStore.getState().refreshUser();
      }
      return;
    }
    if (wasSignedIn) useBillingStore.getState()._reset();
  });
}

export interface UseAuthReturn {
  user: User | null;
  subscription: SubscriptionPlan | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const user = useBillingStore((s) => s.user);
  const subscription = useBillingStore((s) => s.subscription);
  const isLoading = useBillingStore((s) => s.isLoading);
  const error = useBillingStore((s) => s.error);
  const signOut = useBillingStore((s) => s.signOut);
  const refreshUser = useBillingStore((s) => s.refreshUser);

  return {
    user,
    subscription,
    isAuthenticated: user !== null,
    isLoading,
    error,
    signOut,
    refreshUser,
  };
}

// removed. It exported seven null-rendering React components shadowing real

export { useBillingStore as useBillingUsageStore };
