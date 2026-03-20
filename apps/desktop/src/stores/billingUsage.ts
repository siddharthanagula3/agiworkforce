/**
 * Unified Billing & Usage Store
 *
 * Consolidates billing/usage tracking functionality from:
 * - usageStore.ts - Usage tracking (automations, API calls, storage, tokens)
 * - tokenBudgetStore.ts - Budget enforcement and alerts
 * - analyticsStore.ts - Analytics events and ROI reporting
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version
 * - subscribeWithSelector for granular subscriptions
 * - Immer for immutable updates in budget/analytics sections
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';
import { toast } from 'sonner';
import { storageFallback } from '../lib/storageFallback';
import type { CostAnalyticsResponse, CostOverviewResponse } from '../types/chat';
import { supabaseAuth } from '../services/supabaseAuth';
import {
  StripeService,
  type UsageStats,
  type TokenUsageEvent,
  type ModelUsageStats,
} from '../services/stripe';
import { checkUsageLimit, shouldShowUsageWarning } from '../utils/featureGates';
import { useBillingStore } from './auth';
import { getModelMetadata } from '../constants/llm';
import { analytics } from '../services/analytics';
import { ErrorSeverity, errorTracking } from '../services/errorTracking';
import { featureFlags } from '../services/featureFlags';
import { performanceMonitor } from '../services/performance';
import {
  analyticsDeleteAllData,
  analyticsGetUsageStats,
  analyticsGetFeatureUsage,
  analyticsCalculateRoi,
  analyticsGetProcessMetrics,
  analyticsGetUserMetrics,
  analyticsGetToolMetrics,
  analyticsGetMetricTrends,
  analyticsExportReport,
  metricsIncrementAutomations,
  metricsIncrementGoals,
  metricsSetMcpServers,
  metricsSetCacheHitRate,
  trackWorkflowView as apiTrackWorkflowView,
} from '../api/analytics';
import type {
  SystemMetrics as ApiSystemMetrics,
  AppMetrics as ApiAppMetrics,
} from '../api/analytics';
import type {
  AnalyticsConfig,
  FeatureUsageStats,
  PrivacyConsent,
  UsageStats as AnalyticsUsageStats,
} from '../types/analytics';
import type { AllTimeStats, ChartDataPoint, TopEmployee } from '../types/roi';

// ============================================================================
// Types
// ============================================================================

// Subscription/Billing Types (matches Rust PricingPlan struct in subscription.rs)
export interface RustPricingPlan {
  id: string;
  tier: string;
  name: string;
  display_name: string;
  description: string;
  price_monthly_usd: number;
  price_annual_usd: number;
  features: string[];
  limits: Record<string, unknown>;
  is_popular: boolean;
  is_available: boolean;
}

export interface RustSubscriptionInfo {
  stripe_subscription_id: string;
  plan_name: string;
  status: string;
  current_period_start?: number;
  current_period_end?: number;
}

// Cost Types
interface CostFilters {
  days: number;
  provider?: string;
  model?: string;
}

// Budget Types
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'per-conversation';

export interface TokenBudget {
  enabled: boolean;
  period: BudgetPeriod;
  limit: number;
  warningThreshold: number;
  currentUsage: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  periodStart: number;
  periodEnd: number;
}

export interface BudgetAlert {
  id: string;
  type: 'warning' | 'danger' | 'exceeded';
  message: string;
  timestamp: number;
  dismissed: boolean;
}

export interface TokenUsageDetails {
  inputTokens: number;
  outputTokens: number;
  modelId?: string;
  costUsd?: number;
}

// LLM Token Usage params for detailed tracking
interface LLMTokenUsageParams {
  modelId: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}

// ============================================================================
// State Interface
// ============================================================================

interface BillingUsageState {
  // --- Cost State ---
  costOverview: CostOverviewResponse | null;
  costAnalytics: CostAnalyticsResponse | null;
  costFilters: CostFilters;
  loadingCostOverview: boolean;
  loadingCostAnalytics: boolean;
  costError: string | null;

  // --- Subscription State ---
  pricingPlans: RustPricingPlan[];
  currentPlan: RustPricingPlan | null;
  isLoadingPlans: boolean;
  subscriptionError: string | null;

  // --- Usage State ---
  usageStats: UsageStats | null;
  usageStatsLoading: boolean;
  usagePeriodStartSec: number;
  usagePeriodEndSec: number;
  showAutomationWarning: boolean;
  showApiCallWarning: boolean;
  showStorageWarning: boolean;
  showTokenWarning: boolean;
  usageError: string | null;

  // --- Budget State ---
  budget: TokenBudget;
  budgetAlerts: BudgetAlert[];

  // --- Analytics State ---
  systemMetrics: ApiSystemMetrics | null;
  appMetrics: ApiAppMetrics | null;
  analyticsUsageStats: AnalyticsUsageStats | null;
  featureUsage: FeatureUsageStats[];
  analyticsConfig: AnalyticsConfig;
  privacyConsent: PrivacyConsent | null;
  isLoadingMetrics: boolean;
  isLoadingStats: boolean;

  // --- ROI State ---
  roiReport: AllTimeStats | null;
  processMetrics: ChartDataPoint[];
  userMetrics: TopEmployee[];
  toolMetrics: ChartDataPoint[];
  trends: Record<string, ChartDataPoint[]>;
  isLoadingROI: boolean;
}

// ============================================================================
// Actions Interface
// ============================================================================

interface BillingUsageActions {
  // --- Cost Actions ---
  loadCostOverview: () => Promise<void>;
  loadCostAnalytics: (overrides?: Partial<CostFilters>) => Promise<void>;
  setMonthlyBudget: (amount?: number) => Promise<void>;

  // --- Subscription Actions (wired to Rust subscription.rs) ---
  fetchPricingPlans: () => Promise<RustPricingPlan[]>;
  fetchCurrentPlan: (userId: string) => Promise<RustPricingPlan | null>;
  subscribeToPlan: (
    userId: string,
    planId: string,
    billingInterval?: string,
  ) => Promise<RustSubscriptionInfo | null>;
  upgradePlan: (userId: string, newPlanId: string) => Promise<RustSubscriptionInfo | null>;
  cancelPlanSubscription: (userId: string, subscriptionId: string) => Promise<boolean>;

  // --- Usage Actions ---
  fetchUsage: (customerId: string, periodStart: number, periodEnd: number) => Promise<void>;
  refreshUsage: () => Promise<void>;
  trackAutomation: () => Promise<void>;
  trackApiCall: (count?: number) => Promise<void>;
  trackStorage: (sizeInMb: number) => Promise<void>;
  trackLLMTokens: (tokens: number) => Promise<void>;
  trackLLMUsageDetailed: (params: LLMTokenUsageParams) => Promise<void>;
  trackBrowserSession: () => Promise<void>;
  trackMCPToolCall: () => Promise<void>;
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

  // --- Budget Actions ---
  setBudgetEnabled: (enabled: boolean) => void;
  setBudgetPeriod: (period: BudgetPeriod) => void;
  setBudgetLimit: (limit: number) => void;
  setWarningThreshold: (threshold: number) => void;
  addTokenUsage: (tokens: number) => void;
  addDetailedTokenUsage: (details: TokenUsageDetails) => void;
  resetBudgetPeriod: () => void;
  dismissAlert: (alertId: string) => void;
  clearAlerts: () => void;
  getBudgetInputTokens: () => number;
  getBudgetOutputTokens: () => number;
  getBudgetTotalTokens: () => number;
  getEstimatedCost: () => number;

  // --- Analytics Actions ---
  loadSystemMetrics: () => Promise<void>;
  loadAppMetrics: () => Promise<void>;
  loadAnalyticsUsageStats: () => Promise<void>;
  loadFeatureUsage: () => Promise<void>;
  refreshAllMetrics: () => Promise<void>;
  updateAnalyticsConfig: (config: Partial<AnalyticsConfig>) => void;
  updatePrivacyConsent: (consent: PrivacyConsent) => void;
  exportAnalyticsData: () => Promise<void>;
  deleteAllAnalyticsData: () => Promise<void>;
  isFeatureEnabled: (flagName: string) => boolean;
  trackFeatureUsage: (flagName: string) => void;

  // --- Analytics Metric Actions (wired to Rust analytics.rs) ---
  incrementAutomationsMetric: () => Promise<void>;
  incrementGoalsMetric: () => Promise<void>;
  setMcpServersMetric: (count: number) => Promise<void>;
  setCacheHitRateMetric: (rate: number) => Promise<void>;
  trackWorkflowView: (workflowId: string) => Promise<void>;

  // --- ROI Actions ---
  calculateROI: (startDate: number, endDate: number) => Promise<AllTimeStats>;
  loadProcessMetrics: (startDate: number, endDate: number) => Promise<ChartDataPoint[]>;
  loadUserMetrics: (startDate: number, endDate: number) => Promise<TopEmployee[]>;
  loadToolMetrics: (startDate: number, endDate: number) => Promise<ChartDataPoint[]>;
  loadTrends: (metric: string, days: number) => Promise<ChartDataPoint[]>;
  exportReport: (format: string, startDate: number, endDate: number) => Promise<string>;
  loadAllROIData: (startDate: number, endDate: number) => Promise<void>;
}

type BillingUsageStore = BillingUsageState & BillingUsageActions;

// ============================================================================
// Helper Functions
// ============================================================================

const DEFAULT_COST_FILTERS: CostFilters = {
  days: 30,
};

function normalizeFilterValue(value?: string): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? undefined : trimmed;
}

function calculatePeriodEnd(periodStart: number, period: BudgetPeriod): number {
  const start = new Date(periodStart);

  switch (period) {
    case 'daily':
      start.setDate(start.getDate() + 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      start.setDate(start.getDate() + 7);
      start.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      start.setDate(1);
      start.setMonth(start.getMonth() + 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'per-conversation':
      return periodStart + 365 * 24 * 60 * 60 * 1000;
  }

  return start.getTime();
}

function shouldResetPeriod(budget: TokenBudget): boolean {
  if (budget.period === 'per-conversation') {
    return false;
  }
  return Date.now() >= budget.periodEnd;
}

// storageFallback is imported from '../lib/storageFallback'
const getStorage = () => (typeof window === 'undefined' ? storageFallback : window.localStorage);

// ============================================================================
// Store Implementation
// ============================================================================

export const useBillingUsageStore = create<BillingUsageStore>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          // ----------------------------------------------------------------
          // Initial State
          // ----------------------------------------------------------------

          // Cost State
          costOverview: null,
          costAnalytics: null,
          costFilters: DEFAULT_COST_FILTERS,
          loadingCostOverview: false,
          loadingCostAnalytics: false,
          costError: null,

          // Subscription State
          pricingPlans: [],
          currentPlan: null,
          isLoadingPlans: false,
          subscriptionError: null,

          // Usage State
          usageStats: null,
          usageStatsLoading: false,
          usagePeriodStartSec: Math.floor(Date.now() / 1000),
          usagePeriodEndSec: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          showAutomationWarning: false,
          showApiCallWarning: false,
          showStorageWarning: false,
          showTokenWarning: false,
          usageError: null,

          // Budget State
          budget: {
            enabled: false,
            period: 'daily',
            limit: 100000,
            warningThreshold: 80,
            currentUsage: 0,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: 0,
            periodStart: Date.now(),
            periodEnd: calculatePeriodEnd(Date.now(), 'daily'),
          },
          budgetAlerts: [],

          // Analytics State
          systemMetrics: null,
          appMetrics: null,
          analyticsUsageStats: null,
          featureUsage: [],
          analyticsConfig: analytics.getConfig(),
          privacyConsent: analytics.getPrivacyConsent() || null,
          isLoadingMetrics: false,
          isLoadingStats: false,

          // ROI State
          roiReport: null,
          processMetrics: [],
          userMetrics: [],
          toolMetrics: [],
          trends: {},
          isLoadingROI: false,

          // ----------------------------------------------------------------
          // Cost Actions
          // ----------------------------------------------------------------

          loadCostOverview: async () => {
            set({ loadingCostOverview: true, costError: null });
            try {
              const userId = supabaseAuth.getUser()?.id;
              if (!userId) {
                set({
                  loadingCostOverview: false,
                  costError: null,
                  costOverview: null,
                });
                return;
              }
              const response = await invoke<CostOverviewResponse>('chat_get_cost_overview', {
                userId,
              });
              set({ costOverview: response, loadingCostOverview: false });
            } catch (error) {
              console.error('Failed to load cost overview:', error);
              set({ loadingCostOverview: false, costError: String(error) });
            }
          },

          loadCostAnalytics: async (overrides) => {
            const state = get();
            const merged: CostFilters = {
              ...state.costFilters,
              ...overrides,
            };

            const providerNormalized = normalizeFilterValue(merged.provider);
            const modelNormalized = normalizeFilterValue(merged.model);

            const sanitized: CostFilters = {
              days: merged.days,
            };
            if (providerNormalized) {
              sanitized.provider = providerNormalized;
            }
            if (modelNormalized) {
              sanitized.model = modelNormalized;
            }

            set({
              loadingCostAnalytics: true,
              costError: null,
              costFilters: sanitized,
            });

            try {
              const userId = supabaseAuth.getUser()?.id;
              if (!userId) {
                set({
                  loadingCostAnalytics: false,
                  costError: null,
                  costAnalytics: null,
                });
                return;
              }
              const analyticsData = await invoke<CostAnalyticsResponse>('chat_get_cost_analytics', {
                userId,
                days: sanitized.days,
                provider: sanitized.provider ?? null,
                model: sanitized.model ?? null,
              });
              set({
                costAnalytics: analyticsData,
                loadingCostAnalytics: false,
              });
            } catch (error) {
              console.error('Failed to load cost analytics:', error);
              set({ loadingCostAnalytics: false, costError: String(error) });
            }
          },

          setMonthlyBudget: async (amount) => {
            try {
              const userId = supabaseAuth.getUser()?.id;
              if (!userId) throw new Error('User not authenticated');
              await invoke('chat_set_monthly_budget', {
                userId,
                amount: amount ?? null,
              });
              await get().loadCostOverview();
            } catch (error) {
              console.error('Failed to update monthly budget:', error);
              set({ costError: String(error) });
              throw error;
            }
          },

          // ----------------------------------------------------------------
          // Subscription Actions (wired to Rust subscription.rs)
          // ----------------------------------------------------------------

          fetchPricingPlans: async () => {
            set({ isLoadingPlans: true, subscriptionError: null });
            try {
              const plans = await invoke<RustPricingPlan[]>('get_pricing_plans');
              set({ pricingPlans: plans, isLoadingPlans: false });
              return plans;
            } catch (error) {
              console.error('Failed to fetch pricing plans:', error);
              set({ isLoadingPlans: false, subscriptionError: String(error) });
              return [];
            }
          },

          fetchCurrentPlan: async (userId: string) => {
            if (!userId?.trim()) {
              toast.error('User ID is required to fetch current plan');
              return null;
            }
            set({ isLoadingPlans: true, subscriptionError: null });
            try {
              const plan = await invoke<RustPricingPlan>('get_current_plan', { userId });
              set({ currentPlan: plan, isLoadingPlans: false });
              return plan;
            } catch (error) {
              console.error('Failed to fetch current plan:', error);
              set({ isLoadingPlans: false, subscriptionError: String(error) });
              return null;
            }
          },

          subscribeToPlan: async (userId: string, planId: string, billingInterval?: string) => {
            if (!userId?.trim()) {
              toast.error('User ID is required to subscribe');
              return null;
            }
            if (!planId?.trim()) {
              toast.error('Plan ID is required to subscribe');
              return null;
            }
            set({ isLoadingPlans: true, subscriptionError: null });
            try {
              const sub = await invoke<RustSubscriptionInfo>('subscribe_to_plan', {
                userId,
                planId,
                billingInterval: billingInterval ?? null,
              });
              set({ isLoadingPlans: false });
              // Refresh current plan after subscribing
              await get().fetchCurrentPlan(userId);
              return sub;
            } catch (error) {
              console.error('Failed to subscribe to plan:', error);
              set({ isLoadingPlans: false, subscriptionError: String(error) });
              return null;
            }
          },

          upgradePlan: async (userId: string, newPlanId: string) => {
            if (!userId?.trim()) {
              toast.error('User ID is required to upgrade plan');
              return null;
            }
            if (!newPlanId?.trim()) {
              toast.error('Plan ID is required to upgrade');
              return null;
            }
            set({ isLoadingPlans: true, subscriptionError: null });
            try {
              const sub = await invoke<RustSubscriptionInfo>('upgrade_plan', {
                userId,
                newPlanId,
              });
              set({ isLoadingPlans: false });
              // Refresh current plan after upgrade
              await get().fetchCurrentPlan(userId);
              return sub;
            } catch (error) {
              console.error('Failed to upgrade plan:', error);
              set({ isLoadingPlans: false, subscriptionError: String(error) });
              return null;
            }
          },

          cancelPlanSubscription: async (userId: string, subscriptionId: string) => {
            if (!userId?.trim()) {
              toast.error('User ID is required to cancel subscription');
              return false;
            }
            if (!subscriptionId?.trim()) {
              toast.error('Subscription ID is required to cancel');
              return false;
            }
            set({ isLoadingPlans: true, subscriptionError: null });
            try {
              await invoke('cancel_subscription', { userId, subscriptionId });
              set({ isLoadingPlans: false, currentPlan: null });
              return true;
            } catch (error) {
              console.error('Failed to cancel subscription:', error);
              set({ isLoadingPlans: false, subscriptionError: String(error) });
              return false;
            }
          },

          // ----------------------------------------------------------------
          // Usage Actions
          // ----------------------------------------------------------------

          fetchUsage: async (customerId: string, periodStart: number, periodEnd: number) => {
            try {
              set({ usageStatsLoading: true, usageError: null });
              const stats = await StripeService.getUsage(customerId, periodStart, periodEnd);

              const { stripeSubscription: subscription } = useBillingStore.getState();

              set({
                usageStats: stats,
                usagePeriodStartSec: periodStart,
                usagePeriodEndSec: periodEnd,
                usageStatsLoading: false,
                showAutomationWarning: shouldShowUsageWarning(
                  'automations',
                  stats.automations_executed,
                  subscription,
                ),
                showApiCallWarning: shouldShowUsageWarning(
                  'apiCalls',
                  stats.api_calls_made,
                  subscription,
                ),
                showStorageWarning: shouldShowUsageWarning(
                  'storage',
                  stats.storage_used_mb,
                  subscription,
                ),
                showTokenWarning: shouldShowUsageWarning(
                  'tokenCredits',
                  stats.model_usage?.reduce((acc, m) => acc + m.cost_usd, 0) || 0,
                  subscription,
                ),
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Failed to fetch usage';
              set({ usageError: errorMessage, usageStatsLoading: false });
              throw error;
            }
          },

          refreshUsage: async () => {
            const { usagePeriodStartSec, usagePeriodEndSec } = get();
            const { stripeCustomer: customer } = useBillingStore.getState();

            if (!customer) {
              throw new Error('No customer found');
            }

            await get().fetchUsage(customer.id, usagePeriodStartSec, usagePeriodEndSec);
          },

          trackAutomation: async () => {
            const { stripeCustomer: customer } = useBillingStore.getState();
            const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();

            // BUG-009 fix: silently no-op when stripeCustomer is null (BYOK/dev mode)
            if (!customer) return;

            try {
              await StripeService.trackUsage(
                customer.id,
                'automation_execution',
                1,
                usagePeriodStartSec,
                usagePeriodEndSec,
              );

              if (usageStats) {
                set({
                  usageStats: {
                    ...usageStats,
                    automations_executed: usageStats.automations_executed + 1,
                  },
                });
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Failed to track automation';
              set({ usageError: errorMessage });
              throw error;
            }
          },

          trackApiCall: async (count = 1) => {
            const { stripeCustomer: customer } = useBillingStore.getState();
            const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();

            // BUG-009 fix: silently no-op when stripeCustomer is null (BYOK/dev mode)
            if (!customer) return;

            try {
              await StripeService.trackUsage(
                customer.id,
                'api_call',
                count,
                usagePeriodStartSec,
                usagePeriodEndSec,
              );

              if (usageStats) {
                set({
                  usageStats: {
                    ...usageStats,
                    api_calls_made: usageStats.api_calls_made + count,
                  },
                });
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Failed to track API call';
              set({ usageError: errorMessage });
              throw error;
            }
          },

          trackStorage: async (sizeInMb: number) => {
            const { stripeCustomer: customer } = useBillingStore.getState();
            const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();

            // BUG-009 fix: silently no-op when stripeCustomer is null (BYOK/dev mode)
            if (!customer) return;

            try {
              await StripeService.trackUsage(
                customer.id,
                'storage_mb',
                sizeInMb,
                usagePeriodStartSec,
                usagePeriodEndSec,
              );

              if (usageStats) {
                set({
                  usageStats: {
                    ...usageStats,
                    storage_used_mb: usageStats.storage_used_mb + sizeInMb,
                  },
                });
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Failed to track storage';
              set({ usageError: errorMessage });
              throw error;
            }
          },

          trackLLMTokens: async (tokens: number) => {
            const { stripeCustomer: customer } = useBillingStore.getState();
            const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();

            // BUG-009 fix: silently no-op when stripeCustomer is null (BYOK/dev mode)
            if (!customer) return;

            try {
              await StripeService.trackUsage(
                customer.id,
                'llm_tokens',
                tokens,
                usagePeriodStartSec,
                usagePeriodEndSec,
              );

              if (usageStats) {
                set({
                  usageStats: {
                    ...usageStats,
                    llm_tokens_used: usageStats.llm_tokens_used + tokens,
                  },
                });
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Failed to track LLM tokens';
              set({ usageError: errorMessage });
              throw error;
            }
          },

          trackLLMUsageDetailed: async ({ modelId, provider, inputTokens, outputTokens }) => {
            const { stripeCustomer: customer } = useBillingStore.getState();
            const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();

            // BUG-009 fix: silently no-op when stripeCustomer is null (BYOK/dev mode)
            if (!customer) return;

            try {
              const modelMeta = getModelMetadata(modelId);
              const inputCost = modelMeta ? (inputTokens / 1_000_000) * modelMeta.inputCost : 0;
              const outputCost = modelMeta ? (outputTokens / 1_000_000) * modelMeta.outputCost : 0;
              const totalCost = inputCost + outputCost;

              const event: TokenUsageEvent = {
                model_id: modelId,
                provider,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cost_usd: totalCost,
                timestamp: Date.now(),
              };

              await StripeService.trackLLMUsage(
                customer.id,
                event,
                usagePeriodStartSec,
                usagePeriodEndSec,
              );

              if (usageStats) {
                const totalTokens = inputTokens + outputTokens;
                const existing = (usageStats.model_usage || []).find((m) => m.model_id === modelId);
                const modelUsage = existing
                  ? (usageStats.model_usage || []).map((m) =>
                      m.model_id === modelId
                        ? {
                            ...m,
                            input_tokens: m.input_tokens + inputTokens,
                            output_tokens: m.output_tokens + outputTokens,
                            total_tokens: m.total_tokens + totalTokens,
                            cost_usd: m.cost_usd + totalCost,
                            request_count: m.request_count + 1,
                          }
                        : m,
                    )
                  : [
                      ...(usageStats.model_usage || []),
                      {
                        model_id: modelId,
                        model_name: modelMeta?.name || modelId,
                        provider,
                        input_tokens: inputTokens,
                        output_tokens: outputTokens,
                        total_tokens: totalTokens,
                        cost_usd: totalCost,
                        request_count: 1,
                      },
                    ];

                set({
                  usageStats: {
                    ...usageStats,
                    llm_tokens_used: usageStats.llm_tokens_used + totalTokens,
                    llm_input_tokens: usageStats.llm_input_tokens + inputTokens,
                    llm_output_tokens: usageStats.llm_output_tokens + outputTokens,
                    model_usage: modelUsage,
                  },
                });
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Failed to track LLM usage';
              set({ usageError: errorMessage });
              throw error;
            }
          },

          trackBrowserSession: async () => {
            const { stripeCustomer: customer } = useBillingStore.getState();
            const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();

            // BUG-009 fix: silently no-op when stripeCustomer is null (BYOK/dev mode)
            if (!customer) return;

            try {
              await StripeService.trackUsage(
                customer.id,
                'browser_session',
                1,
                usagePeriodStartSec,
                usagePeriodEndSec,
              );

              if (usageStats) {
                set({
                  usageStats: {
                    ...usageStats,
                    browser_sessions: usageStats.browser_sessions + 1,
                  },
                });
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Failed to track browser session';
              set({ usageError: errorMessage });
              throw error;
            }
          },

          trackMCPToolCall: async () => {
            const { stripeCustomer: customer } = useBillingStore.getState();
            const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();

            // BUG-009 fix: silently no-op when stripeCustomer is null (BYOK/dev mode)
            if (!customer) return;

            try {
              await StripeService.trackUsage(
                customer.id,
                'mcp_tool_call',
                1,
                usagePeriodStartSec,
                usagePeriodEndSec,
              );

              if (usageStats) {
                set({
                  usageStats: {
                    ...usageStats,
                    mcp_tool_calls: usageStats.mcp_tool_calls + 1,
                  },
                });
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Failed to track MCP tool call';
              set({ usageError: errorMessage });
              throw error;
            }
          },

          checkAutomationLimit: () => {
            const { usageStats } = get();
            const { stripeSubscription: subscription } = useBillingStore.getState();

            if (!usageStats) return true;

            const limitCheck = checkUsageLimit(
              'automations',
              usageStats.automations_executed,
              subscription,
            );
            return limitCheck.withinLimit;
          },

          checkApiCallLimit: () => {
            const { usageStats } = get();
            const { stripeSubscription: subscription } = useBillingStore.getState();

            if (!usageStats) return true;

            const limitCheck = checkUsageLimit('apiCalls', usageStats.api_calls_made, subscription);
            return limitCheck.withinLimit;
          },

          checkStorageLimit: (additionalMb: number) => {
            const { usageStats } = get();
            const { stripeSubscription: subscription } = useBillingStore.getState();

            if (!usageStats) return true;

            const totalStorage = usageStats.storage_used_mb + additionalMb;
            const limitCheck = checkUsageLimit('storage', totalStorage, subscription);
            return limitCheck.withinLimit;
          },

          getInputTokens: () => {
            const { usageStats } = get();
            return usageStats?.llm_input_tokens || 0;
          },

          getOutputTokens: () => {
            const { usageStats } = get();
            return usageStats?.llm_output_tokens || 0;
          },

          getTotalTokens: () => {
            const { usageStats } = get();
            return usageStats?.llm_tokens_used || 0;
          },

          getModelUsage: () => {
            const { usageStats } = get();
            return usageStats?.model_usage || [];
          },

          getTokenCost: () => {
            const { usageStats } = get();
            if (!usageStats?.model_usage) return 0;
            return usageStats.model_usage.reduce((total, model) => total + model.cost_usd, 0);
          },

          resetUsage: () => {
            set({
              usageStats: {
                automations_executed: 0,
                api_calls_made: 0,
                storage_used_mb: 0,
                llm_tokens_used: 0,
                llm_input_tokens: 0,
                llm_output_tokens: 0,
                browser_sessions: 0,
                mcp_tool_calls: 0,
                model_usage: [],
              },
              showAutomationWarning: false,
              showApiCallWarning: false,
              showStorageWarning: false,
              showTokenWarning: false,
            });
          },

          setUsagePeriod: (start: number, end: number) => {
            set({ usagePeriodStartSec: start, usagePeriodEndSec: end });
          },

          setUsageError: (error) => set({ usageError: error }),
          clearUsageError: () => set({ usageError: null }),

          // ----------------------------------------------------------------
          // Budget Actions
          // ----------------------------------------------------------------

          setBudgetEnabled: (enabled: boolean) => {
            set((state) => {
              state.budget.enabled = enabled;
              if (enabled && state.budget.currentUsage === 0) {
                const now = Date.now();
                state.budget.periodStart = now;
                state.budget.periodEnd = calculatePeriodEnd(now, state.budget.period);
              }
            });
          },

          setBudgetPeriod: (period: BudgetPeriod) => {
            set((state) => {
              state.budget.period = period;
              const now = Date.now();
              state.budget.periodStart = now;
              state.budget.periodEnd = calculatePeriodEnd(now, period);
              state.budget.currentUsage = 0;
              state.budget.inputTokens = 0;
              state.budget.outputTokens = 0;
              state.budget.estimatedCost = 0;
              state.budgetAlerts = [];
            });
          },

          setBudgetLimit: (limit: number) => {
            set((state) => {
              state.budget.limit = limit;
            });
          },

          setWarningThreshold: (threshold: number) => {
            set((state) => {
              state.budget.warningThreshold = Math.min(100, Math.max(0, threshold));
            });
          },

          addTokenUsage: (tokens: number) => {
            set((state) => {
              if (!state.budget.enabled) {
                return;
              }

              if (shouldResetPeriod(state.budget)) {
                const now = Date.now();
                state.budget.periodStart = now;
                state.budget.periodEnd = calculatePeriodEnd(now, state.budget.period);
                state.budget.currentUsage = 0;
                state.budget.inputTokens = 0;
                state.budget.outputTokens = 0;
                state.budget.estimatedCost = 0;
                state.budgetAlerts = [];
              }

              state.budget.currentUsage += tokens;

              const percentage = (state.budget.currentUsage / state.budget.limit) * 100;

              if (percentage >= 100) {
                const existingExceeded = state.budgetAlerts.find(
                  (a) => a.type === 'exceeded' && !a.dismissed,
                );
                if (!existingExceeded) {
                  state.budgetAlerts.push({
                    id: `exceeded-${Date.now()}`,
                    type: 'exceeded',
                    message: `Token budget exceeded! Used ${state.budget.currentUsage.toLocaleString()} of ${state.budget.limit.toLocaleString()} tokens.`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              } else if (percentage >= 90) {
                const existingDanger = state.budgetAlerts.find(
                  (a) => a.type === 'danger' && !a.dismissed,
                );
                if (!existingDanger) {
                  state.budgetAlerts.push({
                    id: `danger-${Date.now()}`,
                    type: 'danger',
                    message: `Token budget at ${percentage.toFixed(0)}%! Only ${(state.budget.limit - state.budget.currentUsage).toLocaleString()} tokens remaining.`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              } else if (percentage >= state.budget.warningThreshold) {
                const existingWarning = state.budgetAlerts.find(
                  (a) => a.type === 'warning' && !a.dismissed,
                );
                if (!existingWarning) {
                  state.budgetAlerts.push({
                    id: `warning-${Date.now()}`,
                    type: 'warning',
                    message: `Token budget at ${percentage.toFixed(0)}%. You've used ${state.budget.currentUsage.toLocaleString()} of ${state.budget.limit.toLocaleString()} tokens.`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              }

              // STR-001 fix: Cap budgetAlerts array at 100 entries, removing oldest dismissed alerts first
              if (state.budgetAlerts.length > 100) {
                // First try to remove dismissed alerts
                const dismissedAlerts = state.budgetAlerts.filter((a) => a.dismissed);
                if (dismissedAlerts.length > 0) {
                  // Remove oldest dismissed alerts (prioritize removing dismissed ones)
                  state.budgetAlerts = state.budgetAlerts
                    .sort((a, b) => {
                      // Keep non-dismissed alerts first, then sort by timestamp
                      if (a.dismissed !== b.dismissed) return a.dismissed ? 1 : -1;
                      return b.timestamp - a.timestamp;
                    })
                    .slice(0, 100);
                } else {
                  // No dismissed alerts, just keep the most recent 100
                  state.budgetAlerts = state.budgetAlerts.slice(-100);
                }
              }
            });
          },

          addDetailedTokenUsage: (details: TokenUsageDetails) => {
            set((state) => {
              if (!state.budget.enabled) {
                return;
              }

              if (shouldResetPeriod(state.budget)) {
                const now = Date.now();
                state.budget.periodStart = now;
                state.budget.periodEnd = calculatePeriodEnd(now, state.budget.period);
                state.budget.currentUsage = 0;
                state.budget.inputTokens = 0;
                state.budget.outputTokens = 0;
                state.budget.estimatedCost = 0;
                state.budgetAlerts = [];
              }

              const totalTokens = details.inputTokens + details.outputTokens;

              state.budget.currentUsage += totalTokens;
              state.budget.inputTokens += details.inputTokens;
              state.budget.outputTokens += details.outputTokens;
              state.budget.estimatedCost += details.costUsd || 0;

              const percentage = (state.budget.currentUsage / state.budget.limit) * 100;

              if (percentage >= 100) {
                const existingExceeded = state.budgetAlerts.find(
                  (a) => a.type === 'exceeded' && !a.dismissed,
                );
                if (!existingExceeded) {
                  state.budgetAlerts.push({
                    id: `exceeded-${Date.now()}`,
                    type: 'exceeded',
                    message: `Token budget exceeded! Used ${state.budget.currentUsage.toLocaleString()} of ${state.budget.limit.toLocaleString()} tokens (Input: ${state.budget.inputTokens.toLocaleString()}, Output: ${state.budget.outputTokens.toLocaleString()}). Est. cost: $${state.budget.estimatedCost.toFixed(4)}`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              } else if (percentage >= 90) {
                const existingDanger = state.budgetAlerts.find(
                  (a) => a.type === 'danger' && !a.dismissed,
                );
                if (!existingDanger) {
                  state.budgetAlerts.push({
                    id: `danger-${Date.now()}`,
                    type: 'danger',
                    message: `Token budget at ${percentage.toFixed(0)}%! Only ${(state.budget.limit - state.budget.currentUsage).toLocaleString()} tokens remaining. Est. cost: $${state.budget.estimatedCost.toFixed(4)}`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              } else if (percentage >= state.budget.warningThreshold) {
                const existingWarning = state.budgetAlerts.find(
                  (a) => a.type === 'warning' && !a.dismissed,
                );
                if (!existingWarning) {
                  state.budgetAlerts.push({
                    id: `warning-${Date.now()}`,
                    type: 'warning',
                    message: `Token budget at ${percentage.toFixed(0)}%. Input: ${state.budget.inputTokens.toLocaleString()}, Output: ${state.budget.outputTokens.toLocaleString()}. Est. cost: $${state.budget.estimatedCost.toFixed(4)}`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              }

              // STR-001 fix: Cap budgetAlerts array at 100 entries
              if (state.budgetAlerts.length > 100) {
                const dismissedAlerts = state.budgetAlerts.filter((a) => a.dismissed);
                if (dismissedAlerts.length > 0) {
                  state.budgetAlerts = state.budgetAlerts
                    .sort((a, b) => {
                      if (a.dismissed !== b.dismissed) return a.dismissed ? 1 : -1;
                      return b.timestamp - a.timestamp;
                    })
                    .slice(0, 100);
                } else {
                  state.budgetAlerts = state.budgetAlerts.slice(-100);
                }
              }
            });
          },

          resetBudgetPeriod: () => {
            set((state) => {
              const now = Date.now();
              state.budget.periodStart = now;
              state.budget.periodEnd = calculatePeriodEnd(now, state.budget.period);
              state.budget.currentUsage = 0;
              state.budget.inputTokens = 0;
              state.budget.outputTokens = 0;
              state.budget.estimatedCost = 0;
              state.budgetAlerts = [];
            });
          },

          dismissAlert: (alertId: string) => {
            set((state) => {
              const alert = state.budgetAlerts.find((a) => a.id === alertId);
              if (alert) {
                alert.dismissed = true;
              }
            });
          },

          clearAlerts: () => {
            set((state) => {
              state.budgetAlerts = [];
            });
          },

          getBudgetInputTokens: () => get().budget.inputTokens,
          getBudgetOutputTokens: () => get().budget.outputTokens,
          getBudgetTotalTokens: () => get().budget.currentUsage,
          getEstimatedCost: () => get().budget.estimatedCost,

          // ----------------------------------------------------------------
          // Analytics Actions
          // ----------------------------------------------------------------

          loadSystemMetrics: async () => {
            set({ isLoadingMetrics: true });
            try {
              const metrics = await performanceMonitor.getSystemMetrics();
              set({ systemMetrics: metrics });
            } catch (error) {
              console.error('Failed to load system metrics:', error);
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                {
                  component: 'billingUsageStore',
                  severity: ErrorSeverity.MEDIUM,
                },
              );
            } finally {
              set({ isLoadingMetrics: false });
            }
          },

          loadAppMetrics: async () => {
            set({ isLoadingMetrics: true });
            try {
              const metrics = await performanceMonitor.getAppMetrics();
              set({ appMetrics: metrics });
            } catch (error) {
              console.error('Failed to load app metrics:', error);
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                {
                  component: 'billingUsageStore',
                  severity: ErrorSeverity.MEDIUM,
                },
              );
            } finally {
              set({ isLoadingMetrics: false });
            }
          },

          loadAnalyticsUsageStats: async () => {
            set({ isLoadingStats: true });
            try {
              const stats = (await analyticsGetUsageStats()) as unknown as AnalyticsUsageStats;
              set({ analyticsUsageStats: stats });
            } catch (error) {
              console.error('Failed to load usage stats:', error);
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                {
                  component: 'billingUsageStore',
                  severity: ErrorSeverity.MEDIUM,
                },
              );
            } finally {
              set({ isLoadingStats: false });
            }
          },

          loadFeatureUsage: async () => {
            try {
              const usage = (await analyticsGetFeatureUsage()) as unknown as FeatureUsageStats[];
              // STR-006 fix: Cap featureUsage at 500 entries to prevent unbounded growth
              const cappedUsage = Array.isArray(usage) ? usage.slice(0, 500) : [];
              set({ featureUsage: cappedUsage });
            } catch (error) {
              console.error('Failed to load feature usage:', error);
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                {
                  component: 'billingUsageStore',
                  severity: ErrorSeverity.MEDIUM,
                },
              );
            }
          },

          refreshAllMetrics: async () => {
            const { loadSystemMetrics, loadAppMetrics, loadAnalyticsUsageStats, loadFeatureUsage } =
              get();
            await Promise.all([
              loadSystemMetrics(),
              loadAppMetrics(),
              loadAnalyticsUsageStats(),
              loadFeatureUsage(),
            ]);
          },

          updateAnalyticsConfig: (newConfig: Partial<AnalyticsConfig>) => {
            set((state) => {
              state.analyticsConfig = { ...state.analyticsConfig, ...newConfig };
            });
            analytics.updateConfig(newConfig);
          },

          updatePrivacyConsent: (consent: PrivacyConsent) => {
            set({ privacyConsent: consent });
            analytics.updatePrivacyConsent(consent);

            if (consent.error_reporting_enabled) {
              errorTracking.initialize();
            }

            analytics.track('settings_changed', {
              setting_type: 'privacy_consent',
              analytics_enabled: consent.analytics_enabled,
              error_reporting_enabled: consent.error_reporting_enabled,
              performance_monitoring_enabled: consent.performance_monitoring_enabled,
            });
          },

          exportAnalyticsData: async () => {
            try {
              await analytics.exportData();
              analytics.track('data_exported', {
                export_type: 'analytics',
              });
            } catch (error) {
              console.error('Failed to export analytics data:', error);
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                {
                  component: 'billingUsageStore',
                  severity: ErrorSeverity.HIGH,
                },
              );
            }
          },

          deleteAllAnalyticsData: async () => {
            try {
              await analytics.deleteAllData();
              await analyticsDeleteAllData();

              set({
                systemMetrics: null,
                appMetrics: null,
                analyticsUsageStats: null,
                featureUsage: [],
                privacyConsent: null,
              });
            } catch (error) {
              console.error('Failed to delete analytics data:', error);
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                {
                  component: 'billingUsageStore',
                  severity: ErrorSeverity.HIGH,
                },
              );
            }
          },

          isFeatureEnabled: (flagName: string) => {
            return featureFlags.isEnabled(flagName);
          },

          trackFeatureUsage: (flagName: string) => {
            featureFlags.trackFeatureUsage(flagName);
          },

          // ----------------------------------------------------------------
          // Analytics Metric Actions (wired to Rust analytics.rs)
          // ----------------------------------------------------------------

          incrementAutomationsMetric: async () => {
            try {
              await metricsIncrementAutomations();
            } catch (error) {
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                { component: 'billingUsageStore', tags: { action: 'incrementAutomationsMetric' } },
              );
            }
          },

          incrementGoalsMetric: async () => {
            try {
              await metricsIncrementGoals();
            } catch (error) {
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                { component: 'billingUsageStore', tags: { action: 'incrementGoalsMetric' } },
              );
            }
          },

          setMcpServersMetric: async (count: number) => {
            try {
              await metricsSetMcpServers(count);
            } catch (error) {
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                { component: 'billingUsageStore', tags: { action: 'setMcpServersMetric' } },
              );
            }
          },

          setCacheHitRateMetric: async (rate: number) => {
            try {
              await metricsSetCacheHitRate(rate);
            } catch (error) {
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                { component: 'billingUsageStore', tags: { action: 'setCacheHitRateMetric' } },
              );
            }
          },

          trackWorkflowView: async (workflowId: string) => {
            try {
              await apiTrackWorkflowView(workflowId);
            } catch (error) {
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                { component: 'billingUsageStore', tags: { action: 'trackWorkflowView' } },
              );
            }
          },

          // ----------------------------------------------------------------
          // ROI Actions
          // ----------------------------------------------------------------

          calculateROI: async (startDate: number, endDate: number) => {
            set({ isLoadingROI: true });
            try {
              const roi = (await analyticsCalculateRoi(
                startDate,
                endDate,
              )) as unknown as AllTimeStats;
              set({ roiReport: roi });
              return roi;
            } catch (error) {
              console.error('Failed to calculate ROI:', error);
              errorTracking.captureError(
                error instanceof Error ? error : new Error(String(error)),
                {
                  component: 'billingUsageStore',
                  severity: ErrorSeverity.HIGH,
                },
              );
              throw error;
            } finally {
              set({ isLoadingROI: false });
            }
          },

          loadProcessMetrics: async (startDate: number, endDate: number) => {
            try {
              const metrics = (await analyticsGetProcessMetrics(
                startDate,
                endDate,
              )) as unknown as ChartDataPoint[];
              set({ processMetrics: metrics || [] });
              return metrics || [];
            } catch (error) {
              console.error('Failed to load process metrics:', error);
              throw error;
            }
          },

          loadUserMetrics: async (startDate: number, endDate: number) => {
            try {
              const metrics = (await analyticsGetUserMetrics(
                startDate,
                endDate,
              )) as unknown as TopEmployee[];
              set({ userMetrics: metrics || [] });
              return metrics || [];
            } catch (error) {
              console.error('Failed to load user metrics:', error);
              throw error;
            }
          },

          loadToolMetrics: async (startDate: number, endDate: number) => {
            try {
              const metrics = (await analyticsGetToolMetrics(
                startDate,
                endDate,
              )) as unknown as ChartDataPoint[];
              set({ toolMetrics: metrics || [] });
              return metrics || [];
            } catch (error) {
              console.error('Failed to load tool metrics:', error);
              throw error;
            }
          },

          loadTrends: async (metric: string, days: number) => {
            try {
              const trendsData = (await analyticsGetMetricTrends(
                metric,
                days,
              )) as unknown as ChartDataPoint[];
              // STR-007 fix: Cap trends dictionary at 20 metrics to prevent unbounded growth
              // Each metric can have up to 365 data points, so 20 metrics × 365 = 7,300 points max
              const MAX_TREND_METRICS = 20;
              set((state) => {
                const currentKeys = Object.keys(state.trends);
                // If we're at capacity and adding a new metric, remove the first (oldest) one
                if (currentKeys.length >= MAX_TREND_METRICS && !state.trends[metric]) {
                  const keyToRemove = currentKeys[0];
                  if (keyToRemove) {
                    delete state.trends[keyToRemove];
                  }
                }
                state.trends[metric] = trendsData || [];
              });
              return trendsData || [];
            } catch (error) {
              console.error('Failed to load trends:', error);
              throw error;
            }
          },

          exportReport: async (format: string, startDate: number, endDate: number) => {
            try {
              const report = await analyticsExportReport(format, startDate, endDate);

              const blob = new Blob([report as string], {
                type:
                  format === 'json'
                    ? 'application/json'
                    : format === 'csv'
                      ? 'text/csv'
                      : 'text/markdown',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `roi-report-${Date.now()}.${format === 'markdown' ? 'md' : format}`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);

              return report;
            } catch (error) {
              console.error('Failed to export report:', error);
              throw error;
            }
          },

          loadAllROIData: async (startDate: number, endDate: number) => {
            const { calculateROI, loadProcessMetrics, loadUserMetrics, loadToolMetrics } = get();

            set({ isLoadingROI: true });
            try {
              await Promise.all([
                calculateROI(startDate, endDate),
                loadProcessMetrics(startDate, endDate),
                loadUserMetrics(startDate, endDate),
                loadToolMetrics(startDate, endDate),
              ]);
            } finally {
              set({ isLoadingROI: false });
            }
          },
        })),
      ),
      {
        name: 'billing-usage-store',
        version: 1,
        storage: createJSONStorage(() => getStorage()),
        partialize: (state) => ({
          costFilters: state.costFilters,
          budget: state.budget,
          budgetAlerts: state.budgetAlerts,
        }),
        migrate: (persistedState: unknown, _version: number) => {
          // Handle future migrations here
          return persistedState as BillingUsageState;
        },
      },
    ),
    { name: 'BillingUsageStore', enabled: import.meta.env.DEV },
  ),
);

// ============================================================================
// Selectors
// ============================================================================

// Cost Selectors
export const selectCostOverview = (state: BillingUsageStore) => state.costOverview;
export const selectCostAnalytics = (state: BillingUsageStore) => state.costAnalytics;
export const selectCostFilters = (state: BillingUsageStore) => state.costFilters;
export const selectCostLoading = (state: BillingUsageStore) =>
  state.loadingCostOverview || state.loadingCostAnalytics;
export const selectCostError = (state: BillingUsageStore) => state.costError;

// Budget Selectors
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

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate usage percentage (how much has been used)
 * @param used - Amount used
 * @param total - Total allocated amount
 * @returns Percentage used (0-100)
 */
export function getUsagePercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

/**
 * Calculate remaining percentage (how much is left)
 * @param used - Amount used
 * @param total - Total allocated amount
 * @returns Percentage remaining (0-100)
 */
export function getRemainingPercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round(((total - used) / total) * 100);
}

// ============================================================================
// Initialization Functions
// ============================================================================

/**
 * Initialize usage tracking by subscribing to billing store changes.
 * Returns cleanup function.
 */
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

/**
 * Start auto-refresh of analytics metrics every 30 seconds.
 */
export function startMetricsAutoRefresh() {
  if (metricsRefreshInterval !== null || typeof window === 'undefined') {
    return;
  }

  metricsRefreshInterval = setInterval(() => {
    const store = useBillingUsageStore.getState();
    if (store.analyticsConfig.enabled) {
      store.refreshAllMetrics();
    }
  }, 30000);

  // Register cleanup on window unload to prevent interval leaking
  if (!cleanupRegistered && typeof window !== 'undefined') {
    cleanupRegistered = true;
    window.addEventListener('beforeunload', stopMetricsAutoRefresh);
  }
}

/**
 * Stop auto-refresh of analytics metrics.
 */
export function stopMetricsAutoRefresh() {
  if (metricsRefreshInterval !== null) {
    clearInterval(metricsRefreshInterval);
    metricsRefreshInterval = null;
  }
}

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

/**
 * @deprecated Use useBillingUsageStore instead
 */
export const useCostStore = useBillingUsageStore;

/**
 * @deprecated Use useBillingUsageStore instead
 */
export const useUsageStore = useBillingUsageStore;

/**
 * @deprecated Use useBillingUsageStore instead
 */
export const useTokenBudgetStore = useBillingUsageStore;

/**
 * @deprecated Use useBillingUsageStore instead
 */
export const useAnalyticsStore = useBillingUsageStore;
