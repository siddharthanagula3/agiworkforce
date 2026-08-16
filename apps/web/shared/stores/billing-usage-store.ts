'use client';

import { create } from 'zustand';
import { normalizeUsagePercentage, type ManagedUsageSummaryResponse } from '@agiworkforce/types';

export interface BudgetState {
  enabled: boolean;
  dailyBudget: number;
  monthlyBudget: number;
  spent: number;
}

export interface BudgetAlert {
  id: string;
  type: 'warning' | 'danger' | 'exceeded';
  message: string;
  timestamp: number;
  dismissed?: boolean;
}

export type CostOverview = ManagedUsageSummaryResponse;

export interface BillingUsageState {
  dailyBudget_cents: number;
  monthlyBudget_cents: number;
  sessionCost_cents: number;
  costOverview: CostOverview | null;
  budgetAlerts: BudgetAlert[];
  isLoadingOverview: boolean;

  addTokenUsage: (tokenCount: number) => void;
  loadCostOverview: () => Promise<void>;
  dismissAlert: (id: string) => void;
  getTokenCost: () => number;
  _addAlert: (alert: Omit<BudgetAlert, 'id' | 'timestamp'>) => void;
  _clearAlerts: () => void;
}

const APPROX_CENTS_PER_TOKEN = 0.002;

const WARNING_THRESHOLD = 0.8;
const DANGER_THRESHOLD = 0.95;

export const useBillingUsageStore = create<BillingUsageState>()((set, get) => ({
  dailyBudget_cents: 0,
  monthlyBudget_cents: 0,
  sessionCost_cents: 0,
  costOverview: null,
  budgetAlerts: [],
  isLoadingOverview: false,

  addTokenUsage: (tokenCount: number) => {
    const cost = Math.ceil(tokenCount * APPROX_CENTS_PER_TOKEN);
    const state = get();
    const newSessionCost = state.sessionCost_cents + cost;
    set({ sessionCost_cents: newSessionCost });

    const { budgetAlerts, costOverview } = get();
    if (costOverview) {
      const ratio = normalizeUsagePercentage(costOverview.usage_percentage) / 100;

      const hasActiveAlert = (type: BudgetAlert['type']) =>
        budgetAlerts.some((a) => a.type === type && !a.dismissed);

      if (ratio >= 1 && !hasActiveAlert('exceeded')) {
        get()._addAlert({
          type: 'exceeded',
          message:
            'Usage budget exhausted for this billing period. Further requests may be blocked.',
        });
      } else if (ratio >= DANGER_THRESHOLD && ratio < 1 && !hasActiveAlert('danger')) {
        get()._addAlert({
          type: 'danger',
          message: `You have used ${Math.round(ratio * 100)}% of your usage budget.`,
        });
      } else if (
        ratio >= WARNING_THRESHOLD &&
        ratio < DANGER_THRESHOLD &&
        !hasActiveAlert('warning')
      ) {
        get()._addAlert({
          type: 'warning',
          message: `You have used ${Math.round(ratio * 100)}% of your usage budget.`,
        });
      }
    }
  },

  loadCostOverview: async () => {
    if (get().isLoadingOverview) return;
    set({ isLoadingOverview: true });
    try {
      const response = await fetch('/api/usage', { credentials: 'include' });
      if (response.ok) {
        const data = (await response.json()) as CostOverview;
        set({
          costOverview: data,
          isLoadingOverview: false,
        });
      } else {
        set({ isLoadingOverview: false });
      }
    } catch {
      set({ isLoadingOverview: false });
    }
  },

  dismissAlert: (id: string) => {
    set((state) => ({
      budgetAlerts: state.budgetAlerts.map((a) => (a.id === id ? { ...a, dismissed: true } : a)),
    }));
  },

  getTokenCost: () => {
    const state = get();
    return state.sessionCost_cents;
  },

  _addAlert: (alert) => {
    set((state) => {
      const updated = [
        ...state.budgetAlerts,
        {
          ...alert,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ];
      return {
        budgetAlerts: updated.length > 50 ? updated.slice(-50) : updated,
      };
    });
  },

  _clearAlerts: () => {
    set({ budgetAlerts: [] });
  },
}));

export function selectBudget(state: BillingUsageState): BudgetState {
  const enabled = state.dailyBudget_cents > 0 || state.monthlyBudget_cents > 0;
  return {
    enabled,
    dailyBudget: state.dailyBudget_cents,
    monthlyBudget: state.monthlyBudget_cents,
    spent: state.sessionCost_cents,
  };
}

