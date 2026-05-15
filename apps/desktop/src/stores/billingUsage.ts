// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
/**
 * Unified Billing & Usage Store
 *
 * State is split into per-domain slices under ./billing/:
 *   costSlice.ts         — cost overview / analytics
 *   subscriptionSlice.ts — pricing plans / subscription lifecycle
 *   usageSlice.ts        — Stripe usage tracking (automations, tokens, storage …)
 *   budgetSlice.ts       — token budget enforcement and alerts
 *   analyticsSlice.ts    — performance metrics, ROI, feature flags
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import { useBillingStore } from './auth';

import { createCostSlice } from './billing/costSlice';
import type { CostSlice } from './billing/costSlice';

import { createSubscriptionSlice } from './billing/subscriptionSlice';
import type { SubscriptionSlice } from './billing/subscriptionSlice';

import { createUsageSlice } from './billing/usageSlice';
import type { UsageSlice } from './billing/usageSlice';

import { createBudgetSlice } from './billing/budgetSlice';
import type { BudgetSlice } from './billing/budgetSlice';

import { createAnalyticsSlice } from './billing/analyticsSlice';
import type { AnalyticsSlice } from './billing/analyticsSlice';

// ── Re-exports so consumers can import named types from this file ─────────────
export type { RustPricingPlan, RustSubscriptionInfo } from './billing/subscriptionSlice';
export type {
  BudgetPeriod,
  TokenBudget,
  BudgetAlert,
  TokenUsageDetails,
} from './billing/budgetSlice';

// ── Combined store type ────────────────────────────────────────────────────────
type BillingUsageStore = CostSlice & SubscriptionSlice & UsageSlice & BudgetSlice & AnalyticsSlice;

// ── Storage helper ─────────────────────────────────────────────────────────────
const getStorage = () => (typeof window === 'undefined' ? storageFallback : window.localStorage);

// ── Unified Zustand store ──────────────────────────────────────────────────────
export const useBillingUsageStore = create<BillingUsageStore>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        ...createCostSlice(set as Parameters<typeof createCostSlice>[0], get as () => CostSlice),
        ...createSubscriptionSlice(
          set as Parameters<typeof createSubscriptionSlice>[0],
          get as () => SubscriptionSlice,
        ),
        ...createUsageSlice(set as Parameters<typeof createUsageSlice>[0], get as () => UsageSlice),
        ...createBudgetSlice(
          set as Parameters<typeof createBudgetSlice>[0],
          get as () => BudgetSlice,
        ),
        ...createAnalyticsSlice(
          set as Parameters<typeof createAnalyticsSlice>[0],
          get as () => AnalyticsSlice,
        ),
      })),
      {
        name: 'billing-usage-store',
        version: 1,
        storage: createJSONStorage(() => getStorage()),
        partialize: (state) => ({
          costFilters: state.costFilters,
          budget: state.budget,
          budgetAlerts: state.budgetAlerts,
        }),
        migrate: (persistedState: unknown) => persistedState as BillingUsageStore,
      },
    ),
    { name: 'BillingUsageStore', enabled: import.meta.env.DEV },
  ),
);

// ── Selectors ─────────────────────────────────────────────────────────────────
export const selectCostOverview = (state: BillingUsageStore) => state.costOverview;
export const selectCostAnalytics = (state: BillingUsageStore) => state.costAnalytics;
export const selectCostFilters = (state: BillingUsageStore) => state.costFilters;
export const selectCostLoading = (state: BillingUsageStore) =>
  state.loadingCostOverview || state.loadingCostAnalytics;
export const selectCostError = (state: BillingUsageStore) => state.costError;

export const selectBudget = (state: BillingUsageStore) => state.budget;
export const selectActiveAlerts = (state: BillingUsageStore) =>
  state.budgetAlerts.filter((a) => !a.dismissed);
export const selectBudgetPercentage = (state: BillingUsageStore) =>
  (state.budget.currentUsage / state.budget.limit) * 100;
export const selectInputTokens = (state: BillingUsageStore) => state.budget.inputTokens;
export const selectOutputTokens = (state: BillingUsageStore) => state.budget.outputTokens;
export const selectEstimatedCost = (state: BillingUsageStore) => state.budget.estimatedCost;
export const selectTokenBreakdown = (state: BillingUsageStore) => ({
  total: state.budget.currentUsage,
  input: state.budget.inputTokens,
  output: state.budget.outputTokens,
  cost: state.budget.estimatedCost,
  percentage: (state.budget.currentUsage / state.budget.limit) * 100,
});

// ── Utility functions ──────────────────────────────────────────────────────────
export function getUsagePercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

export function getRemainingPercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round(((total - used) / total) * 100);
}

// ── Initialization helpers ─────────────────────────────────────────────────────
export function initializeUsageStore(): () => void {
  const unsubscribe = useBillingStore.subscribe((state) => {
    const billingUsageStore = useBillingUsageStore.getState();
    const { stripeSubscription: subscription, stripeCustomer: customer } = state;

    if (subscription && subscription.current_period_start && subscription.current_period_end) {
      if (
        subscription.current_period_start !== billingUsageStore.usagePeriodStartSec ||
        subscription.current_period_end !== billingUsageStore.usagePeriodEndSec
      ) {
        billingUsageStore.setUsagePeriod(
          subscription.current_period_start,
          subscription.current_period_end,
        );
        if (customer) {
          void billingUsageStore.fetchUsage(
            customer.id,
            subscription.current_period_start,
            subscription.current_period_end,
          );
        }
      }
    }
  });
  return unsubscribe;
}

let metricsRefreshInterval: ReturnType<typeof setInterval> | null = null;
let cleanupRegistered = false;

export function startMetricsAutoRefresh(): () => void {
  if (metricsRefreshInterval !== null || typeof window === 'undefined') {
    return () => {};
  }
  metricsRefreshInterval = setInterval(() => {
    const store = useBillingUsageStore.getState();
    if (store.analyticsConfig.enabled) {
      store.refreshAllMetrics();
    }
  }, 30000);
  if (!cleanupRegistered) {
    cleanupRegistered = true;
    window.addEventListener('beforeunload', stopMetricsAutoRefresh);
  }
  return () => {
    stopMetricsAutoRefresh();
    window.removeEventListener('beforeunload', stopMetricsAutoRefresh);
    cleanupRegistered = false;
  };
}

export function stopMetricsAutoRefresh() {
  if (metricsRefreshInterval !== null) {
    clearInterval(metricsRefreshInterval);
    metricsRefreshInterval = null;
  }
}

// ── Backward-compat aliases ────────────────────────────────────────────────────
/** @deprecated Use useBillingUsageStore instead */
export const useCostStore = useBillingUsageStore;
/** @deprecated Use useBillingUsageStore instead */
export const useUsageStore = useBillingUsageStore;
/** @deprecated Use useBillingUsageStore instead */
export const useTokenBudgetStore = useBillingUsageStore;
/** @deprecated Use useBillingUsageStore instead */
export const useAnalyticsStore = useBillingUsageStore;
