import type { UsageStats, ModelUsageStats } from '../../types/billing';
import { checkUsageLimit } from '../../utils/featureGates';
import { useBillingStore } from '../auth';

/**
 * Usage slice.
 *
 * Usage metering is SERVER-SIDE. When desktop Cloud mode calls the shared web
 * completions API, the server meters against the credit ledger on its own —
 * client-side `trackUsage` calls were removed (2026-07-10) because they
 * double-counted and required Stripe secrets on the client (a trust-boundary
 * violation). The old `StripeService.trackUsage`/`getUsage` path invoked Tauri
 * billing commands initialized with a Stripe API key; that parallel billing
 * backend has been deleted.
 *
 * The desktop `UsageStats` shape (automations / api_calls / storage /
 * per-model tokens) has no honest source in the web REST API: `/api/usage`
 * returns credit-ledger balances (cents), not this legacy metering shape, and
 * `/api/usage/providers` groups by provider, not per-model. Rather than
 * fabricate those fields, `fetchUsage` leaves `usageStats` null — the UI
 * (UsageProgressBars, UsageDashboard) already renders an honest no-data
 * fallback. Credit balance/limits ARE available and flow through the unified
 * auth store (`credits`, `creditBalance_cents`) via `fetchCreditsWithCache`.
 *
 * Gap: a first-class per-model usage read for the desktop dashboards is not
 * wired. It would map `/api/usage/providers` (+ `/api/usage/analytics`) onto a
 * new credit-based view; tracked as follow-up.
 */

export interface UsageSliceState {
  usageStats: UsageStats | null;
  usageStatsLoading: boolean;
  usagePeriodStartSec: number;
  usagePeriodEndSec: number;
  showAutomationWarning: boolean;
  showApiCallWarning: boolean;
  showStorageWarning: boolean;
  showTokenWarning: boolean;
  usageError: string | null;
}

export interface UsageSliceActions {
  fetchUsage: (customerId: string, periodStart: number, periodEnd: number) => Promise<void>;
  refreshUsage: () => Promise<void>;
  checkAutomationLimit: () => boolean;
  checkApiCallLimit: () => boolean;
  checkStorageLimit: (additionalMb: number) => boolean;
  getInputTokens: () => number;
  getOutputTokens: () => number;
  getTotalTokens: () => number;
  getModelUsage: () => ModelUsageStats[];
  getTokenCost: () => number;
  resetUsage: () => void;
  setUsagePeriod: (start: number, end: number) => void;
  setUsageError: (error: string | null) => void;
  clearUsageError: () => void;
}

export type UsageSlice = UsageSliceState & UsageSliceActions;

export const createUsageSlice = (
  set: (partial: Partial<UsageSlice> | ((s: UsageSlice) => Partial<UsageSlice>)) => void,
  get: () => UsageSlice,
): UsageSlice => ({
  usageStats: null,
  usageStatsLoading: false,
  usagePeriodStartSec: Math.floor(Date.now() / 1000),
  usagePeriodEndSec: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  showAutomationWarning: false,
  showApiCallWarning: false,
  showStorageWarning: false,
  showTokenWarning: false,
  usageError: null,

  // Records the active billing period. Detailed usage stats are metered
  // server-side and are not exposed to the desktop client via the web REST
  // API, so `usageStats` is left null (honest "unavailable" — see file header).
  fetchUsage: async (_customerId, periodStart, periodEnd) => {
    set({
      usagePeriodStartSec: periodStart,
      usagePeriodEndSec: periodEnd,
      usageStatsLoading: false,
      usageError: null,
    });
  },

  refreshUsage: async () => {
    const { usagePeriodStartSec, usagePeriodEndSec } = get();
    const { stripeCustomer: customer } = useBillingStore.getState();
    if (!customer) return;
    await get().fetchUsage(customer.id, usagePeriodStartSec, usagePeriodEndSec);
  },

  checkAutomationLimit: () => {
    const { usageStats } = get();
    const { stripeSubscription: subscription } = useBillingStore.getState();
    if (!usageStats) return true;
    return checkUsageLimit('automations', usageStats.automations_executed, subscription)
      .withinLimit;
  },

  checkApiCallLimit: () => {
    const { usageStats } = get();
    const { stripeSubscription: subscription } = useBillingStore.getState();
    if (!usageStats) return true;
    return checkUsageLimit('apiCalls', usageStats.api_calls_made, subscription).withinLimit;
  },

  checkStorageLimit: (additionalMb) => {
    const { usageStats } = get();
    const { stripeSubscription: subscription } = useBillingStore.getState();
    if (!usageStats) return true;
    return checkUsageLimit('storage', usageStats.storage_used_mb + additionalMb, subscription)
      .withinLimit;
  },

  getInputTokens: () => get().usageStats?.llm_input_tokens || 0,
  getOutputTokens: () => get().usageStats?.llm_output_tokens || 0,
  getTotalTokens: () => get().usageStats?.llm_tokens_used || 0,
  getModelUsage: () => get().usageStats?.model_usage || [],
  getTokenCost: () => {
    const { usageStats } = get();
    if (!usageStats?.model_usage) return 0;
    return usageStats.model_usage.reduce((total, model) => total + model.cost_usd, 0);
  },

  resetUsage: () => {
    set({
      usageStats: null,
      showAutomationWarning: false,
      showApiCallWarning: false,
      showStorageWarning: false,
      showTokenWarning: false,
    });
  },

  setUsagePeriod: (start, end) => set({ usagePeriodStartSec: start, usagePeriodEndSec: end }),
  setUsageError: (error) => set({ usageError: error }),
  clearUsageError: () => set({ usageError: null }),
});
