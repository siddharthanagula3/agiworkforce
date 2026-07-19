'use client';

/**
 * Auth store for the web app (Clerk-backed).
 *
 * Provides:
 *  - useAuth()        — user + subscription + auth helpers
 *  - useBillingStore  — Subscription plan used by chat components
 *
 * Components import `useBillingStore` from this file for subscription/credit data.
 * The store hydrates by calling /api/me once on mount.
 */

import React from 'react';
import { create } from 'zustand';
import { parseMeResponse } from '@agiworkforce/cloud-contracts';
import { normalizeBillingPlanTier, type BillingPlanTier } from '@agiworkforce/types';
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
  tier: BillingPlanTier;
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

export interface FeatureFlags {
  beta_features: boolean;
  advanced_model_access: boolean;
  /** Deployment capability: the E2B code-execution loop is enabled server-side. */
  code_execution?: boolean;
  /** Deployment capability: the generic managed web-search backend is configured. */
  generic_web_search?: boolean;
}

// ---------------------------------------------------------------------------
// Auth + Billing store state shape
// ---------------------------------------------------------------------------

export interface AuthState {
  /** The Clerk user summary, or null when signed out */
  user: User | null;
  /** Subscription plan details fetched from /api/me */
  subscription: SubscriptionPlan | null;
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
  signOut: () => Promise<void>;
  /** Internal: updates user state after /api/me refresh */
  _setUser: (user: User | null) => void;
  _reset: () => void;
}

const INITIAL_STATE: Omit<AuthState, 'refreshUser' | 'signOut' | '_setUser' | '_reset'> = {
  user: null,
  subscription: null,
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
              featureFlags: null,
              isLoading: false,
              initialized: true,
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
          plan_name: data.plan.display_name,
        };

        set({
          subscription: plan,
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
    const { useChatStore } = await import('@shared/stores/web-chat-store');
    useChatStore.getState().reset();
    // Clear memory facts (lazy import avoids pulling the chat package into the
    // module-init path). Memory facts are stored under a single global
    // localStorage key (`agi-memory-store-v1`), not scoped per-user, so on a
    // shared device the next signed-in user would otherwise inherit the
    // previous user's remembered facts. See this file's signOut()
    // — keep this in sync with shared/stores/authentication-store.ts's
    // cleanupAllStores(), which performs the equivalent cleanup for the
    // useAuthStore.logout() sign-out path.
    try {
      const { useMemoryStore } = await import('@agiworkforce/unified-chat');
      useMemoryStore.getState().clear();
    } catch {
      // Memory store unavailable — proceed with the rest of sign-out cleanup.
    }
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
