import {
  StripeService,
  type UsageStats,
  type TokenUsageEvent,
  type ModelUsageStats,
} from '../../services/stripe';
import { checkUsageLimit, shouldShowUsageWarning } from '../../utils/featureGates';
import { useBillingStore } from '../auth';
import { getModelMetadata } from '../../constants/llm';

interface LLMTokenUsageParams {
  modelId: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}

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

  fetchUsage: async (customerId, periodStart, periodEnd) => {
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
        showApiCallWarning: shouldShowUsageWarning('apiCalls', stats.api_calls_made, subscription),
        showStorageWarning: shouldShowUsageWarning('storage', stats.storage_used_mb, subscription),
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
    if (!customer) throw new Error('No customer found');
    await get().fetchUsage(customer.id, usagePeriodStartSec, usagePeriodEndSec);
  },

  trackAutomation: async () => {
    const { stripeCustomer: customer } = useBillingStore.getState();
    const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();
    if (!customer) return;
    try {
      await StripeService.trackUsage(
        customer.id,
        'automation_execution',
        1,
        usagePeriodStartSec,
        usagePeriodEndSec,
      );
      if (usageStats)
        set({
          usageStats: { ...usageStats, automations_executed: usageStats.automations_executed + 1 },
        });
    } catch (error) {
      set({ usageError: error instanceof Error ? error.message : 'Failed to track automation' });
      throw error;
    }
  },

  trackApiCall: async (count = 1) => {
    const { stripeCustomer: customer } = useBillingStore.getState();
    const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();
    if (!customer) return;
    try {
      await StripeService.trackUsage(
        customer.id,
        'api_call',
        count,
        usagePeriodStartSec,
        usagePeriodEndSec,
      );
      if (usageStats)
        set({ usageStats: { ...usageStats, api_calls_made: usageStats.api_calls_made + count } });
    } catch (error) {
      set({ usageError: error instanceof Error ? error.message : 'Failed to track API call' });
      throw error;
    }
  },

  trackStorage: async (sizeInMb) => {
    const { stripeCustomer: customer } = useBillingStore.getState();
    const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();
    if (!customer) return;
    try {
      await StripeService.trackUsage(
        customer.id,
        'storage_mb',
        sizeInMb,
        usagePeriodStartSec,
        usagePeriodEndSec,
      );
      if (usageStats)
        set({
          usageStats: { ...usageStats, storage_used_mb: usageStats.storage_used_mb + sizeInMb },
        });
    } catch (error) {
      set({ usageError: error instanceof Error ? error.message : 'Failed to track storage' });
      throw error;
    }
  },

  trackLLMTokens: async (tokens) => {
    const { stripeCustomer: customer } = useBillingStore.getState();
    const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();
    if (!customer) return;
    try {
      await StripeService.trackUsage(
        customer.id,
        'llm_tokens',
        tokens,
        usagePeriodStartSec,
        usagePeriodEndSec,
      );
      if (usageStats)
        set({
          usageStats: { ...usageStats, llm_tokens_used: usageStats.llm_tokens_used + tokens },
        });
    } catch (error) {
      set({ usageError: error instanceof Error ? error.message : 'Failed to track LLM tokens' });
      throw error;
    }
  },

  trackLLMUsageDetailed: async ({ modelId, provider, inputTokens, outputTokens }) => {
    const { stripeCustomer: customer } = useBillingStore.getState();
    const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();
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
      await StripeService.trackLLMUsage(customer.id, event, usagePeriodStartSec, usagePeriodEndSec);
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
      set({ usageError: error instanceof Error ? error.message : 'Failed to track LLM usage' });
      throw error;
    }
  },

  trackBrowserSession: async () => {
    const { stripeCustomer: customer } = useBillingStore.getState();
    const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();
    if (!customer) return;
    try {
      await StripeService.trackUsage(
        customer.id,
        'browser_session',
        1,
        usagePeriodStartSec,
        usagePeriodEndSec,
      );
      if (usageStats)
        set({ usageStats: { ...usageStats, browser_sessions: usageStats.browser_sessions + 1 } });
    } catch (error) {
      set({
        usageError: error instanceof Error ? error.message : 'Failed to track browser session',
      });
      throw error;
    }
  },

  trackMCPToolCall: async () => {
    const { stripeCustomer: customer } = useBillingStore.getState();
    const { usagePeriodStartSec, usagePeriodEndSec, usageStats } = get();
    if (!customer) return;
    try {
      await StripeService.trackUsage(
        customer.id,
        'mcp_tool_call',
        1,
        usagePeriodStartSec,
        usagePeriodEndSec,
      );
      if (usageStats)
        set({ usageStats: { ...usageStats, mcp_tool_calls: usageStats.mcp_tool_calls + 1 } });
    } catch (error) {
      set({ usageError: error instanceof Error ? error.message : 'Failed to track MCP tool call' });
      throw error;
    }
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

  setUsagePeriod: (start, end) => set({ usagePeriodStartSec: start, usagePeriodEndSec: end }),
  setUsageError: (error) => set({ usageError: error }),
  clearUsageError: () => set({ usageError: null }),
});
