/**
 * Usage store - Tracks feature usage and enforces limits
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  StripeService,
  type UsageStats,
  type TokenUsageEvent,
  type ModelUsageStats,
} from '../services/stripe';
import { checkUsageLimit, shouldShowUsageWarning } from '../utils/featureGates';
import { useBillingStore } from './billingStore';
import { getModelMetadata } from '../constants/llm';

interface UsageState {
  // Current usage stats
  stats: UsageStats | null;
  statsLoading: boolean;

  // Billing period
  periodStart: number;
  periodEnd: number;

  // Warning states
  showAutomationWarning: boolean;
  showApiCallWarning: boolean;
  showStorageWarning: boolean;
  showTokenWarning: boolean;

  // Error state
  error: string | null;
}

interface LLMTokenUsageParams {
  modelId: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}

interface UsageActions {
  // Fetch usage stats
  fetchUsage: (customerId: string, periodStart: number, periodEnd: number) => Promise<void>;
  refreshUsage: () => Promise<void>;

  // Track usage events
  trackAutomation: () => Promise<void>;
  trackApiCall: (count?: number) => Promise<void>;
  trackStorage: (sizeInMb: number) => Promise<void>;
  trackLLMTokens: (tokens: number) => Promise<void>;
  trackLLMUsageDetailed: (params: LLMTokenUsageParams) => Promise<void>;
  trackBrowserSession: () => Promise<void>;
  trackMCPToolCall: () => Promise<void>;

  // Check limits
  checkAutomationLimit: () => boolean;
  checkApiCallLimit: () => boolean;
  checkStorageLimit: (additionalMb: number) => boolean;

  // Token usage helpers
  getInputTokens: () => number;
  getOutputTokens: () => number;
  getTotalTokens: () => number;
  getModelUsage: () => ModelUsageStats[];
  getTokenCost: () => number;

  // Reset usage (called at billing period end)
  resetUsage: () => void;

  // Update period
  setPeriod: (start: number, end: number) => void;

  // Error handling
  setError: (error: string | null) => void;
  clearError: () => void;
}

type UsageStore = UsageState & UsageActions;

export const useUsageStore = create<UsageStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      stats: null,
      statsLoading: false,
      periodStart: Math.floor(Date.now() / 1000),
      periodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days from now
      showAutomationWarning: false,
      showApiCallWarning: false,
      showStorageWarning: false,
      showTokenWarning: false,
      error: null,

      // Fetch usage stats
      fetchUsage: async (customerId: string, periodStart: number, periodEnd: number) => {
        try {
          set({ statsLoading: true, error: null });
          const stats = await StripeService.getUsage(customerId, periodStart, periodEnd);

          const { subscription } = useBillingStore.getState();

          set({
            stats,
            periodStart,
            periodEnd,
            statsLoading: false,
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
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch usage';
          set({ error: errorMessage, statsLoading: false });
          throw error;
        }
      },

      refreshUsage: async () => {
        const { periodStart, periodEnd } = get();
        const { customer } = useBillingStore.getState();

        if (!customer) {
          throw new Error('No customer found');
        }

        await get().fetchUsage(customer.id, periodStart, periodEnd);
      },

      // Track usage events
      trackAutomation: async () => {
        const { customer } = useBillingStore.getState();
        const { periodStart, periodEnd, stats } = get();

        if (!customer) {
          throw new Error('No customer found');
        }

        try {
          await StripeService.trackUsage(
            customer.id,
            'automation_execution',
            1,
            periodStart,
            periodEnd,
          );

          // Update local stats
          if (stats) {
            set({
              stats: {
                ...stats,
                automations_executed: stats.automations_executed + 1,
              },
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to track automation';
          set({ error: errorMessage });
          throw error;
        }
      },

      trackApiCall: async (count = 1) => {
        const { customer } = useBillingStore.getState();
        const { periodStart, periodEnd, stats } = get();

        if (!customer) {
          throw new Error('No customer found');
        }

        try {
          await StripeService.trackUsage(customer.id, 'api_call', count, periodStart, periodEnd);

          // Update local stats
          if (stats) {
            set({
              stats: {
                ...stats,
                api_calls_made: stats.api_calls_made + count,
              },
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to track API call';
          set({ error: errorMessage });
          throw error;
        }
      },

      trackStorage: async (sizeInMb: number) => {
        const { customer } = useBillingStore.getState();
        const { periodStart, periodEnd, stats } = get();

        if (!customer) {
          throw new Error('No customer found');
        }

        try {
          await StripeService.trackUsage(
            customer.id,
            'storage_mb',
            sizeInMb,
            periodStart,
            periodEnd,
          );

          // Update local stats
          if (stats) {
            set({
              stats: {
                ...stats,
                storage_used_mb: stats.storage_used_mb + sizeInMb,
              },
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to track storage';
          set({ error: errorMessage });
          throw error;
        }
      },

      trackLLMTokens: async (tokens: number) => {
        const { customer } = useBillingStore.getState();
        const { periodStart, periodEnd, stats } = get();

        if (!customer) {
          throw new Error('No customer found');
        }

        try {
          await StripeService.trackUsage(customer.id, 'llm_tokens', tokens, periodStart, periodEnd);

          // Update local stats
          if (stats) {
            set({
              stats: {
                ...stats,
                llm_tokens_used: stats.llm_tokens_used + tokens,
              },
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to track LLM tokens';
          set({ error: errorMessage });
          throw error;
        }
      },

      trackLLMUsageDetailed: async ({ modelId, provider, inputTokens, outputTokens }) => {
        const { customer } = useBillingStore.getState();
        const { periodStart, periodEnd, stats } = get();

        if (!customer) {
          throw new Error('No customer found');
        }

        try {
          // Calculate cost using model metadata
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

          await StripeService.trackLLMUsage(customer.id, event, periodStart, periodEnd);

          // Update local stats
          if (stats) {
            const totalTokens = inputTokens + outputTokens;
            const modelUsage = [...(stats.model_usage || [])];

            // Find or create model usage entry
            const existingModel = modelUsage.find((m) => m.model_id === modelId);
            if (existingModel) {
              // Update existing entry
              existingModel.input_tokens += inputTokens;
              existingModel.output_tokens += outputTokens;
              existingModel.total_tokens += totalTokens;
              existingModel.cost_usd += totalCost;
              existingModel.request_count += 1;
            } else {
              modelUsage.push({
                model_id: modelId,
                model_name: modelMeta?.name || modelId,
                provider,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: totalTokens,
                cost_usd: totalCost,
                request_count: 1,
              });
            }

            set({
              stats: {
                ...stats,
                llm_tokens_used: stats.llm_tokens_used + totalTokens,
                llm_input_tokens: stats.llm_input_tokens + inputTokens,
                llm_output_tokens: stats.llm_output_tokens + outputTokens,
                model_usage: modelUsage,
              },
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to track LLM usage';
          set({ error: errorMessage });
          throw error;
        }
      },

      trackBrowserSession: async () => {
        const { customer } = useBillingStore.getState();
        const { periodStart, periodEnd, stats } = get();

        if (!customer) {
          throw new Error('No customer found');
        }

        try {
          await StripeService.trackUsage(customer.id, 'browser_session', 1, periodStart, periodEnd);

          // Update local stats
          if (stats) {
            set({
              stats: {
                ...stats,
                browser_sessions: stats.browser_sessions + 1,
              },
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to track browser session';
          set({ error: errorMessage });
          throw error;
        }
      },

      trackMCPToolCall: async () => {
        const { customer } = useBillingStore.getState();
        const { periodStart, periodEnd, stats } = get();

        if (!customer) {
          throw new Error('No customer found');
        }

        try {
          await StripeService.trackUsage(customer.id, 'mcp_tool_call', 1, periodStart, periodEnd);

          // Update local stats
          if (stats) {
            set({
              stats: {
                ...stats,
                mcp_tool_calls: stats.mcp_tool_calls + 1,
              },
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to track MCP tool call';
          set({ error: errorMessage });
          throw error;
        }
      },

      // Check limits
      checkAutomationLimit: () => {
        const { stats } = get();
        const { subscription } = useBillingStore.getState();

        if (!stats) return false;

        const limitCheck = checkUsageLimit('automations', stats.automations_executed, subscription);
        return limitCheck.withinLimit;
      },

      checkApiCallLimit: () => {
        const { stats } = get();
        const { subscription } = useBillingStore.getState();

        if (!stats) return false;

        const limitCheck = checkUsageLimit('apiCalls', stats.api_calls_made, subscription);
        return limitCheck.withinLimit;
      },

      checkStorageLimit: (additionalMb: number) => {
        const { stats } = get();
        const { subscription } = useBillingStore.getState();

        if (!stats) return false;

        const totalStorage = stats.storage_used_mb + additionalMb;
        const limitCheck = checkUsageLimit('storage', totalStorage, subscription);
        return limitCheck.withinLimit;
      },

      // Token usage helpers
      getInputTokens: () => {
        const { stats } = get();
        return stats?.llm_input_tokens || 0;
      },

      getOutputTokens: () => {
        const { stats } = get();
        return stats?.llm_output_tokens || 0;
      },

      getTotalTokens: () => {
        const { stats } = get();
        return stats?.llm_tokens_used || 0;
      },

      getModelUsage: () => {
        const { stats } = get();
        return stats?.model_usage || [];
      },

      getTokenCost: () => {
        const { stats } = get();
        if (!stats?.model_usage) return 0;
        return stats.model_usage.reduce((total, model) => total + model.cost_usd, 0);
      },

      // Reset usage
      resetUsage: () => {
        set({
          stats: {
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

      // Update period
      setPeriod: (start: number, end: number) => {
        set({ periodStart: start, periodEnd: end });
      },

      // Error handling
      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),
    }),
    { name: 'UsageStore' },
  ),
);
