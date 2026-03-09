/**
 * Cost Store
 *
 * Manages cost overview and analytics data for LLM usage tracking.
 * Split from billingUsage.ts for better separation of concerns.
 *
 * Middleware: devtools(subscribeWithSelector(...))
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import type { CostAnalyticsResponse, CostOverviewResponse } from '../types/chat';
import { supabaseAuth } from '../services/supabaseAuth';

// ============================================================================
// Types
// ============================================================================

export interface CostFilters {
  days: number;
  provider?: string;
  model?: string;
}

interface CostState {
  costOverview: CostOverviewResponse | null;
  costAnalytics: CostAnalyticsResponse | null;
  costFilters: CostFilters;
  loadingCostOverview: boolean;
  loadingCostAnalytics: boolean;
  costError: string | null;
}

interface CostActions {
  loadCostOverview: () => Promise<void>;
  loadCostAnalytics: (overrides?: Partial<CostFilters>) => Promise<void>;
  setMonthlyBudget: (amount?: number) => Promise<void>;
}

type CostStore = CostState & CostActions;

// ============================================================================
// Helpers
// ============================================================================

const DEFAULT_COST_FILTERS: CostFilters = {
  days: 30,
};

function normalizeFilterValue(value?: string): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? undefined : trimmed;
}

// ============================================================================
// Store
// ============================================================================

export const useCostStore = create<CostStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // State
      costOverview: null,
      costAnalytics: null,
      costFilters: DEFAULT_COST_FILTERS,
      loadingCostOverview: false,
      loadingCostAnalytics: false,
      costError: null,

      // Actions
      loadCostOverview: async () => {
        set({ loadingCostOverview: true, costError: null });
        try {
          const userId = supabaseAuth.getUser()?.id;
          if (!userId) {
            set({ loadingCostOverview: false, costError: null, costOverview: null });
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
        const merged: CostFilters = { ...state.costFilters, ...overrides };

        const providerNormalized = normalizeFilterValue(merged.provider);
        const modelNormalized = normalizeFilterValue(merged.model);

        const sanitized: CostFilters = { days: merged.days };
        if (providerNormalized) sanitized.provider = providerNormalized;
        if (modelNormalized) sanitized.model = modelNormalized;

        set({ loadingCostAnalytics: true, costError: null, costFilters: sanitized });

        try {
          const userId = supabaseAuth.getUser()?.id;
          if (!userId) {
            set({ loadingCostAnalytics: false, costError: null, costAnalytics: null });
            return;
          }
          const analyticsData = await invoke<CostAnalyticsResponse>('chat_get_cost_analytics', {
            userId,
            days: sanitized.days,
            provider: sanitized.provider ?? null,
            model: sanitized.model ?? null,
          });
          set({ costAnalytics: analyticsData, loadingCostAnalytics: false });
        } catch (error) {
          console.error('Failed to load cost analytics:', error);
          set({ loadingCostAnalytics: false, costError: String(error) });
        }
      },

      setMonthlyBudget: async (amount) => {
        try {
          const userId = supabaseAuth.getUser()?.id;
          if (!userId) throw new Error('User not authenticated');
          await invoke('chat_set_monthly_budget', { userId, amount: amount ?? null });
          await get().loadCostOverview();
        } catch (error) {
          console.error('Failed to update monthly budget:', error);
          set({ costError: String(error) });
          throw error;
        }
      },
    })),
    { name: 'CostStore', enabled: import.meta.env.DEV },
  ),
);

// ============================================================================
// Selectors
// ============================================================================

export const selectCostOverview = (state: CostStore) => state.costOverview;
export const selectCostAnalytics = (state: CostStore) => state.costAnalytics;
export const selectCostFilters = (state: CostStore) => state.costFilters;
export const selectCostLoading = (state: CostStore) =>
  state.loadingCostOverview || state.loadingCostAnalytics;
export const selectCostError = (state: CostStore) => state.costError;
