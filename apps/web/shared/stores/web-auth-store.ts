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

import { create } from 'zustand';
import { parseMeResponse, type MeSubscriptionSource } from '@agiworkforce/cloud-contracts';
import { normalizeBillingPlanTier, type BillingPlanTier } from '@agiworkforce/types';
import { hasClerkSessionCookie, subscribeToClerkSessionChange } from '@/lib/clerk-session';

/**
 * Canonical profile identity (PER-8). Resolved server-side by `GET /api/me`
 * from `profiles.display_name` + the `general` settings namespace, so every
 * surface reads ONE resolved answer instead of guessing between Clerk
 * metadata, the profiles row and a settings namespace.
 */
export interface UserProfileSummary {
  /** Full name. Null when the user has never set one. */
  display_name: string | null;
  /** What the assistant should call the user (greetings, follow-ups). */
  preferred_name: string | null;
  /** Self-described role, used to tailor responses. */
  work_description: string | null;
}

// Minimal user shape retained for backward compatibility with components reading user.email/id.
export interface User {
  id: string;
  email?: string;
  /** Resolved display name from `/api/me` (never an email prefix guess client-side). */
  name?: string;
  avatar_url?: string | null;
  profile?: UserProfileSummary;
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
  /** Whether the current paid period is scheduled to end without renewal. */
  cancel_at_period_end?: boolean;
  /**
   * Alias used by chat components that read `plan_name`.
   * Mirrors `display_name`.
   */
  plan_name: string;
  /**
   * Who bills this subscription. `/api/me` has always emitted it and Mobile
   * has always read it; the web store used to drop it, so Billing could not
   * say who owns the plan and offered the Stripe portal to every paid
   * account — including rows Stripe has no subscription for (App Store, Play,
   * or an operator-provisioned Team/Enterprise row). Optional because the
   * contract marks it optional for older servers.
   */
  subscription_source?: MeSubscriptionSource;
}

export interface FeatureFlags {
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
  _reset: () => void;
}

const INITIAL_STATE: Omit<AuthState, 'refreshUser' | 'signOut' | '_reset'> = {
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

export const useBillingStore = create<AuthState>()((set) => ({
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
          cancel_at_period_end: data.plan.cancel_at_period_end ?? false,
          plan_name: data.plan.display_name,
          ...(data.plan.subscription_source
            ? { subscription_source: data.plan.subscription_source }
            : {}),
        };

        // PER-3: `user` used to be written ONLY by `_setUser`, which had zero
        // call sites — so `useBillingStore.user` was structurally always null
        // and every consumer silently fell back ('Account' in the sidebar, an
        // empty profile form in Settings). refreshUser owns it now: the single
        // /api/me fetch that already produces the plan also produces the user.
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
    // PER-12: both sign-out paths now run the SAME cleanup. This one used to
    // reset only the chat store and memory facts while
    // `useAuthStore.logout()` reset a different, also-incomplete set — with
    // matching "keep this in sync" comments that had already drifted. There is
    // one implementation, and it derives its localStorage keys from the real
    // persist configs (lazy import avoids a module-init cycle).
    try {
      const { cleanupAllStores } = await import('@shared/stores/authentication-store');
      await cleanupAllStores();
    } catch (error) {
      // Never block sign-out on cleanup: the redirect below must still happen.
      console.error('[Auth] store cleanup during signOut failed:', error);
    }
    set({ ...INITIAL_STATE, isLoading: false, initialized: true });
    if (typeof window !== 'undefined') {
      // Sign-out must discard all in-memory state after Clerk clears its
      // session. Keep the existing full document navigation semantics; an
      // absolute same-origin URL distinguishes this from an App Router route.
      window.location.assign(new URL('/login', window.location.origin));
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

  // PER-1 (sibling of the auth store's watcher): this bootstrap also ran once
  // at module import, so a Clerk cookie that landed afterwards left the
  // billing/user state cleared for the whole SPA session. Re-hydrate when the
  // session cookie changes or the tab regains focus.
  let lastBootstrapCookie = hasClerkSessionCookie();
  subscribeToClerkSessionChange(() => {
    const signedIn = hasClerkSessionCookie();
    const wasSignedIn = lastBootstrapCookie;
    lastBootstrapCookie = signedIn;
    if (signedIn) {
      if (!wasSignedIn || useBillingStore.getState().user === null) {
        void useBillingStore.getState().refreshUser();
      }
      return;
    }
    if (wasSignedIn) useBillingStore.getState()._reset();
  });
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

// AUDIT-FIX STB-25: the "legacy compatibility" block that used to live here was
// removed. It exported seven null-rendering React components shadowing real
// desktop UI (BrowserVisualization, MonacoEditor, TerminalPanel, MemoryPanel,
// ScreenCaptureButton, TimeoutWarningDialog, DiffViewer) plus
// countTokens = () => 0 and getTokenPercentage = () => 0 inside an auth/billing
// module. Nothing imported them - verified repo-wide - but an autoimport picking
// the wrong TerminalPanel would have mounted a feature that silently renders
// nothing, with no type error and no console output, and a zeroed token count in
// a billing path is the same shape of landmine.

// Alias so components that import useBillingUsageStore from here also compile
export { useBillingStore as useBillingUsageStore };
