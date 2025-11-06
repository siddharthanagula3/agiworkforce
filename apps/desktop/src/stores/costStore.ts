import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { CostAnalyticsResponse, CostOverviewResponse } from '../types/chat';

interface CostFilters {
  days: number;
  provider?: string;
  model?: string;
}

interface CostState {
  overview: CostOverviewResponse | null;
  analytics: CostAnalyticsResponse | null;
  filters: CostFilters;
  loadingOverview: boolean;
  loadingAnalytics: boolean;
  error: string | null;
  loadOverview: () => Promise<void>;
  loadAnalytics: (overrides?: Partial<CostFilters>) => Promise<void>;
  setMonthlyBudget: (amount?: number) => Promise<void>;
}

const DEFAULT_FILTERS: CostFilters = {
  days: 30,
};

function normalizeFilterValue(value?: string): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? undefined : trimmed;
}

export const useCostStore = create<CostState>((set, get) => ({
  overview: null,
  analytics: null,
  filters: DEFAULT_FILTERS,
  loadingOverview: false,
  loadingAnalytics: false,
  error: null,

  loadOverview: async () => {
    set({ loadingOverview: true, error: null });
    try {
      const response = await invoke<CostOverviewResponse>('chat_get_cost_overview');
      set({ overview: response, loadingOverview: false });
    } catch (error) {
      console.error('Failed to load cost overview:', error);
      set({ loadingOverview: false, error: String(error) });
    }
  },

  loadAnalytics: async (overrides) => {
    const merged: CostFilters = {
      ...get().filters,
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
      loadingAnalytics: true,
      error: null,
      filters: sanitized,
    });

    try {
      const analytics = await invoke<CostAnalyticsResponse>('chat_get_cost_analytics', {
        days: sanitized.days,
        provider: sanitized.provider ?? null,
        model: sanitized.model ?? null,
      });
      set({
        analytics,
        loadingAnalytics: false,
      });
    } catch (error) {
      console.error('Failed to load cost analytics:', error);
      set({ loadingAnalytics: false, error: String(error) });
    }
  },

  setMonthlyBudget: async (amount) => {
    try {
      await invoke('chat_set_monthly_budget', {
        amount: amount ?? null,
      });
      await get().loadOverview();
    } catch (error) {
      console.error('Failed to update monthly budget:', error);
      set({ error: String(error) });
      throw error;
    }
  },
}));
