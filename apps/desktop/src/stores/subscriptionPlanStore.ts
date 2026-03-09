/**
 * Subscription Plan Store
 *
 * Handles plan tier, subscription status, and tier-derived flags (isPro,
 * isEnterprise). This is the single source of truth for "what plan is the
 * user on?" throughout the desktop app.
 *
 * Extracted from the unified auth.ts god store.
 *
 * Persist key: 'subscription-plan-storage' (v1)
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import { type PlanTier, PLAN_DISPLAY_NAMES } from '../lib/supabase';

// Re-export for convenience so callers don't need a separate lib/supabase import
export type { PlanTier } from '../lib/supabase';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// State & Actions
// =============================================================================

interface SubscriptionPlanState {
  /** Current plan tier. null = unknown / not yet fetched. */
  plan: PlanTier | null;
  /** Human-readable plan name (e.g. "Pro", "Hobby"). */
  planDisplayName: string;
  /** Stripe/backend subscription status. */
  subscriptionStatus: SubscriptionStatus;
  /** Tracks the async state of the last plan fetch. */
  subscriptionFetchStatus: SubscriptionFetchStatus;
  /** Unix timestamp (ms) of the current subscription period end. */
  currentPeriodEnd: number | null;
  /** True for hobby, pro, max, enterprise. */
  isPro: boolean;
  /** True only for enterprise. */
  isEnterprise: boolean;
}

interface SubscriptionPlanActions {
  /** Set the plan tier and derive all dependent flags. */
  setPlan: (plan: PlanTier) => void;
  /** Bulk update — used by the authOrchestrator sync result. */
  applySubscriptionSync: (data: {
    plan: PlanTier | null;
    planDisplayName: string;
    subscriptionStatus: SubscriptionStatus;
    subscriptionFetchStatus: SubscriptionFetchStatus;
    currentPeriodEnd: number | null;
    isPro: boolean;
    isEnterprise: boolean;
  }) => void;
  /** For testing / demos — temporarily override the visible plan tier. */
  simulatePlan: (plan: PlanTier) => void;
  /** Reset to defaults (called on logout). */
  reset: () => void;
}

export type SubscriptionPlanStore = SubscriptionPlanState & SubscriptionPlanActions;

// =============================================================================
// Default state
// =============================================================================

function getDefaultState(): SubscriptionPlanState {
  const devPlan = import.meta.env.VITE_DEV_ACCOUNT_PLAN as PlanTier | undefined;
  const plan: PlanTier | null = devPlan || null;

  return {
    plan,
    planDisplayName: plan ? PLAN_DISPLAY_NAMES[plan] : 'Loading...',
    subscriptionStatus: 'none',
    subscriptionFetchStatus: 'idle',
    currentPeriodEnd: null,
    isPro: false,
    isEnterprise: false,
  };
}

function deriveTierFlags(plan: PlanTier | null): { isPro: boolean; isEnterprise: boolean } {
  return {
    isPro:
      plan !== null &&
      (plan === 'hobby' || plan === 'pro' || plan === 'max' || plan === 'enterprise'),
    isEnterprise: plan === 'enterprise',
  };
}

// =============================================================================
// Store
// =============================================================================

export const useSubscriptionPlanStore = create<SubscriptionPlanStore>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        ...getDefaultState(),

        setPlan: (plan) => {
          set(
            {
              plan,
              planDisplayName: PLAN_DISPLAY_NAMES[plan],
              subscriptionStatus: plan === 'free' ? 'none' : 'active',
              ...deriveTierFlags(plan),
            },
            undefined,
            'subscriptionPlan/setPlan',
          );
        },

        applySubscriptionSync: (data) => {
          set(
            {
              plan: data.plan,
              planDisplayName: data.planDisplayName,
              subscriptionStatus: data.subscriptionStatus,
              subscriptionFetchStatus: data.subscriptionFetchStatus,
              currentPeriodEnd: data.currentPeriodEnd,
              isPro: data.isPro,
              isEnterprise: data.isEnterprise,
            },
            undefined,
            'subscriptionPlan/applySync',
          );
        },

        simulatePlan: (plan) => {
          get().setPlan(plan);
        },

        reset: () => {
          set(getDefaultState(), undefined, 'subscriptionPlan/reset');
        },
      })),
      {
        name: 'subscription-plan-storage',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        // Plan data is always re-fetched from backend on startup — do not persist
        // sensitive tier info that could be spoofed.
        partialize: () => ({}),
        onRehydrateStorage: () => () => {
          // no-op: data fetched fresh from backend
        },
      },
    ),
    { name: 'SubscriptionPlanStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectSubscriptionPlan = (s: SubscriptionPlanStore) => s.plan;
export const selectSubscriptionPlanDisplayName = (s: SubscriptionPlanStore) => s.planDisplayName;
export const selectSubscriptionStatus = (s: SubscriptionPlanStore) => s.subscriptionStatus;
export const selectSubscriptionFetchStatus = (s: SubscriptionPlanStore) =>
  s.subscriptionFetchStatus;
export const selectSubscriptionCurrentPeriodEnd = (s: SubscriptionPlanStore) => s.currentPeriodEnd;
export const selectSubscriptionIsPro = (s: SubscriptionPlanStore) => s.isPro;
export const selectSubscriptionIsEnterprise = (s: SubscriptionPlanStore) => s.isEnterprise;
export const selectSubscriptionIsTierLoading = (s: SubscriptionPlanStore) =>
  s.plan === null || s.subscriptionFetchStatus === 'fetching';
