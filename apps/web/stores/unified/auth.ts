'use client';

/**
 * Auth store for the web app (Clerk-backed).
 *
 * Provides:
 *  - useAuth()        — user + subscription + credits + auth helpers
 *  - useBillingStore  — Subscription plan + credit balance used by chat components
 *
 * Components import `useBillingStore` from this file for subscription/credit data.
 * The store hydrates by calling /api/me once on mount.
 */

import React from 'react';
import { create } from 'zustand';
import { hasClerkSessionCookie } from '@/lib/clerk-session';

// Minimal user shape retained for backward compatibility with components reading user.email/id.
export interface User {
  id: string;
  email?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriptionPlan {
  tier: 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';
  /** Human-readable name e.g. "Pro" */
  display_name: string;
  /** Stripe subscription status */
  status: string;
  /** Unix timestamp of period end, or null for free tier */
  current_period_end: number | null;
  /**
   * Alias used by chat components that read `plan_name`.
   * Mirrors `display_name`.
   */
  plan_name: string;
}

export interface CreditBalance {
  balance_cents: number;
  daily_limit_cents: number | null;
  daily_usage_cents: number;
}

export interface FeatureFlags {
  beta_features: boolean;
  advanced_model_access: boolean;
}

/** Shape returned by /api/me */
interface MeResponse {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
  plan: {
    tier: string;
    display_name: string;
    status: string;
    current_period_end: number | null;
  };
  feature_flags: FeatureFlags;
  credits: CreditBalance | null;
}

// ---------------------------------------------------------------------------
// Auth + Billing store state shape
// ---------------------------------------------------------------------------

export interface AuthState {
  /** The Clerk user summary, or null when signed out */
  user: User | null;
  /** Subscription plan details fetched from /api/me */
  subscription: SubscriptionPlan | null;
  /** Credit balance in cents (null = not yet fetched) */
  creditBalance_cents: number | null;
  /** Daily usage in cents */
  dailyUsage_cents: number;
  /** Daily limit in cents (null = no limit) */
  dailyLimit_cents: number | null;
  /** Feature flags for the current user */
  featureFlags: FeatureFlags | null;
  /** True while the initial /api/me fetch is in-flight */
  isLoading: boolean;
  /** Any error that occurred during the last refresh */
  error: string | null;
  /** True once the Clerk auth state has been determined */
  initialized: boolean;

  // Actions
  refreshUser: () => Promise<void>;
  updateCredits: (credits: CreditBalance) => void;
  signOut: () => Promise<void>;
  /** Internal: updates user state after /api/me refresh */
  _setUser: (user: User | null) => void;
  _reset: () => void;
}

const INITIAL_STATE: Omit<
  AuthState,
  'refreshUser' | 'updateCredits' | 'signOut' | '_setUser' | '_reset'
> = {
  user: null,
  subscription: null,
  creditBalance_cents: null,
  dailyUsage_cents: 0,
  dailyLimit_cents: null,
  featureFlags: null,
  isLoading: true,
  error: null,
  initialized: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let refreshInFlight = false;

export const useBillingStore = create<AuthState>()((set, get) => ({
  ...INITIAL_STATE,

  refreshUser: async () => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      set({ isLoading: true, error: null });
      try {
        const response = await fetch('/api/me', {
          credentials: 'include',
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Not authenticated — clear gracefully
            set({
              user: null,
              subscription: null,
              creditBalance_cents: null,
              dailyUsage_cents: 0,
              dailyLimit_cents: null,
              featureFlags: null,
              isLoading: false,
              initialized: true,
            });
            return;
          }
          throw new Error(`/api/me returned ${response.status}`);
        }

        const data: MeResponse = await response.json();

        const tier = (data.plan.tier || 'free') as SubscriptionPlan['tier'];
        const plan: SubscriptionPlan = {
          tier,
          display_name: data.plan.display_name,
          status: data.plan.status,
          current_period_end: data.plan.current_period_end,
          plan_name: data.plan.display_name,
        };

        set({
          subscription: plan,
          creditBalance_cents: data.credits?.balance_cents ?? null,
          dailyUsage_cents: data.credits?.daily_usage_cents ?? 0,
          dailyLimit_cents: data.credits?.daily_limit_cents ?? null,
          featureFlags: data.feature_flags,
          isLoading: false,
          error: null,
          initialized: true,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ isLoading: false, error: message, initialized: true });
      }
    } finally {
      refreshInFlight = false;
    }
  },

  updateCredits: (credits: CreditBalance) => {
    set({
      creditBalance_cents: credits.balance_cents,
      dailyUsage_cents: credits.daily_usage_cents,
      dailyLimit_cents: credits.daily_limit_cents,
    });
  },

  signOut: async () => {
    // Sign out via Clerk
    try {
      const windowWithClerk = window as unknown as Record<string, unknown>;
      if (typeof window !== 'undefined' && windowWithClerk['Clerk']) {
        const clerkInstance = windowWithClerk['Clerk'] as { signOut?: () => Promise<void> };
        await clerkInstance.signOut?.();
      }
    } catch {
      // Clerk not available or already signed out - proceed with local cleanup
    }
    // Clear chat store (lazy import avoids circular dependency at module-init)
    const { useChatStore } = await import('@/stores/chatStore');
    useChatStore.getState().reset();
    set({ ...INITIAL_STATE, isLoading: false, initialized: true });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  _setUser: (user: User | null) => {
    set({ user });
    if (user) {
      get().refreshUser();
    } else {
      set({
        subscription: null,
        creditBalance_cents: null,
        dailyUsage_cents: 0,
        dailyLimit_cents: null,
        featureFlags: null,
        initialized: true,
        isLoading: false,
      });
    }
  },

  _reset: () => {
    set({ ...INITIAL_STATE, isLoading: false, initialized: true });
  },
}));

// ---------------------------------------------------------------------------
// Bootstrap — runs once when the module is imported on the client
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  if (hasClerkSessionCookie()) {
    // Signed in — load the real user/subscription/credit state via /api/me.
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
    // Signed out — resolve to the cleared, initialized state without probing
    // /api/me (which would 401 and log a console error on every page load).
    useBillingStore.getState()._reset();
  }
}

// ---------------------------------------------------------------------------
// useAuth hook — convenience wrapper matching the interface contract
// ---------------------------------------------------------------------------

export interface UseAuthReturn {
  user: User | null;
  subscription: SubscriptionPlan | null;
  credits: CreditBalance | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const user = useBillingStore((s) => s.user);
  const subscription = useBillingStore((s) => s.subscription);
  const creditBalance_cents = useBillingStore((s) => s.creditBalance_cents);
  const dailyUsage_cents = useBillingStore((s) => s.dailyUsage_cents);
  const dailyLimit_cents = useBillingStore((s) => s.dailyLimit_cents);
  const isLoading = useBillingStore((s) => s.isLoading);
  const error = useBillingStore((s) => s.error);
  const signOut = useBillingStore((s) => s.signOut);
  const refreshUser = useBillingStore((s) => s.refreshUser);

  const credits: CreditBalance | null =
    creditBalance_cents !== null
      ? {
          balance_cents: creditBalance_cents,
          daily_usage_cents: dailyUsage_cents,
          daily_limit_cents: dailyLimit_cents,
        }
      : null;

  return {
    user,
    subscription,
    credits,
    isAuthenticated: user !== null,
    isLoading,
    error,
    signOut,
    refreshUser,
  };
}

// ---------------------------------------------------------------------------
// Legacy / compatibility exports from the old stub
// Components importing misc things from this file keep compiling.
// ---------------------------------------------------------------------------

export const invoke = async () => ({});
export const isTauri = false;
export const countTokens = () => 0;
export const getTokenPercentage = () => 0;

export const BrowserVisualization = (_props?: unknown) => null;
export const MonacoEditor = (_props?: unknown) => null;
export const TerminalPanel = (_props?: unknown) => null;
export const MemoryPanel = (_props?: unknown) => null;
export const ScreenCaptureButton = (_props?: unknown) => null;
export const ErrorBoundary = ({ children }: { children: React.ReactNode }) => children;
export const TimeoutWarningDialog = (_props?: unknown) => null;
export const DiffViewer = (_props?: unknown) => null;
export const handleSlashCommand = () => {};

// Alias so components that import useBillingUsageStore from here also compile
export { useBillingStore as useBillingUsageStore };
