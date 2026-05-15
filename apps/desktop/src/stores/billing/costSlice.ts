import { invoke } from '../../lib/tauri-mock';
import { supabaseAuth } from '../../services/supabaseAuth';
import type { CostAnalyticsResponse, CostOverviewResponse } from '../../types/chat';

export interface CostFilters {
  days: number;
  provider?: string;
  model?: string;
}

export interface CostSliceState {
  costOverview: CostOverviewResponse | null;
  costAnalytics: CostAnalyticsResponse | null;
  costFilters: CostFilters;
  loadingCostOverview: boolean;
  loadingCostAnalytics: boolean;
  costError: string | null;
}

export interface CostSliceActions {
  loadCostOverview: () => Promise<void>;
  loadCostAnalytics: (overrides?: Partial<CostFilters>) => Promise<void>;
  setMonthlyBudget: (amount?: number) => Promise<void>;
}

export type CostSlice = CostSliceState & CostSliceActions;

export const DEFAULT_COST_FILTERS: CostFilters = { days: 30 };

function normalizeFilterValue(value?: string): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? undefined : trimmed;
}

export const createCostSlice = (
  set: (partial: Partial<CostSlice> | ((s: CostSlice) => Partial<CostSlice>)) => void,
  get: () => CostSlice,
): CostSlice => ({
  costOverview: null,
  costAnalytics: null,
  costFilters: DEFAULT_COST_FILTERS,
  loadingCostOverview: false,
  loadingCostAnalytics: false,
  costError: null,

  loadCostOverview: async () => {
    set({ loadingCostOverview: true, costError: null });
    try {
      const userId = supabaseAuth.getUser()?.id;
      if (!userId) {
        set({ loadingCostOverview: false, costError: null, costOverview: null });
        return;
      }
      const response = await invoke<CostOverviewResponse>('chat_get_cost_overview', { userId });
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
});
