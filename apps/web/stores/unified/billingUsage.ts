'use client';

/**
 * Real billing usage store for the web app.
 *
 * Replaces the previous compilation stub. Provides token-budget tracking,
 * cost overview loading, and budget alerts consumed by the agentic chat UI.
 *
 * Limits (dailyBudget / monthlyBudget) are populated from /api/usage when
 * loadCostOverview() is called. Token usage is accumulated locally in the
 * session via addTokenUsage().
 */

import React from 'react';
import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetState {
  /** Whether budget tracking is enabled (true when on a paid plan with a limit) */
  enabled: boolean;
  /** Daily token/credit limit in cents */
  dailyBudget: number;
  /** Monthly token/credit limit in cents */
  monthlyBudget: number;
  /** Amount spent this session (accumulated via addTokenUsage) */
  spent: number;
}

export interface BudgetAlert {
  id: string;
  type: 'warning' | 'danger' | 'exceeded';
  message: string;
  timestamp: number;
  dismissed?: boolean;
}

export interface CostOverview {
  daily_cost_cents: number;
  monthly_cost_cents: number;
  daily_limit_cents: number | null;
  monthly_limit_cents: number | null;
}

export interface BillingUsageState {
  /** Daily budget in cents (0 = no limit / free tier) */
  dailyBudget_cents: number;
  /** Monthly budget in cents (0 = no limit / free tier) */
  monthlyBudget_cents: number;
  /** Accumulated token cost for the current session in cents */
  sessionCost_cents: number;
  /** Cost overview loaded from /api/usage */
  costOverview: CostOverview | null;
  /** Active budget alerts shown in BudgetAlertsPanel */
  budgetAlerts: BudgetAlert[];
  /** Whether a cost overview fetch is in progress */
  isLoadingOverview: boolean;

  // Actions
  addTokenUsage: (tokenCount: number) => void;
  loadCostOverview: () => Promise<void>;
  dismissAlert: (id: string) => void;
  getTokenCost: () => number;
  /** Internal: push a new alert */
  _addAlert: (alert: Omit<BudgetAlert, 'id' | 'timestamp'>) => void;
  _clearAlerts: () => void;
}

// Rough approximation: 1 token ≈ 0.002 cents (used only for local budget metering)
const APPROX_CENTS_PER_TOKEN = 0.002;

// Thresholds as fractions of the daily limit
const WARNING_THRESHOLD = 0.8;
const DANGER_THRESHOLD = 0.95;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

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

    // Generate budget alerts when daily thresholds are crossed
    const { dailyBudget_cents, budgetAlerts, costOverview } = get();
    if (dailyBudget_cents > 0) {
      const totalUsage = newSessionCost + (costOverview?.daily_cost_cents ?? 0);
      const ratio = totalUsage / dailyBudget_cents;

      const hasActiveAlert = (type: BudgetAlert['type']) =>
        budgetAlerts.some((a) => a.type === type && !a.dismissed);

      if (ratio >= 1 && !hasActiveAlert('exceeded')) {
        get()._addAlert({
          type: 'exceeded',
          message: 'Daily budget limit reached. Further requests may be blocked.',
        });
      } else if (ratio >= DANGER_THRESHOLD && ratio < 1 && !hasActiveAlert('danger')) {
        get()._addAlert({
          type: 'danger',
          message: `You have used ${Math.round(ratio * 100)}% of your daily budget.`,
        });
      } else if (
        ratio >= WARNING_THRESHOLD &&
        ratio < DANGER_THRESHOLD &&
        !hasActiveAlert('warning')
      ) {
        get()._addAlert({
          type: 'warning',
          message: `You have used ${Math.round(ratio * 100)}% of your daily budget.`,
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
        const data: CostOverview = await response.json();
        set({
          costOverview: data,
          dailyBudget_cents: data.daily_limit_cents ?? 0,
          monthlyBudget_cents: data.monthly_limit_cents ?? 0,
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
    return state.sessionCost_cents + (state.costOverview?.monthly_cost_cents ?? 0);
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
      // Cap budget alerts to prevent unbounded growth
      return {
        budgetAlerts: updated.length > 50 ? updated.slice(-50) : updated,
      };
    });
  },

  _clearAlerts: () => {
    set({ budgetAlerts: [] });
  },
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * selectBudget — consumed by BudgetTracker in UnifiedAgenticChat.
 * Returns a stable object describing whether budget tracking is active and the spend.
 */
export function selectBudget(state: BillingUsageState): BudgetState {
  const enabled = state.dailyBudget_cents > 0 || state.monthlyBudget_cents > 0;
  return {
    enabled,
    dailyBudget: state.dailyBudget_cents,
    monthlyBudget: state.monthlyBudget_cents,
    spent: state.sessionCost_cents,
  };
}

// ---------------------------------------------------------------------------
// Legacy / compatibility exports kept from the old stub
// ---------------------------------------------------------------------------

export const invoke = async () => ({});
export const isTauri = false;
export const countTokens = () => 0;
export const getTokenPercentage = () => 0;

export const BrowserVisualization = () => null;
export const MonacoEditor = () => null;
export const TerminalPanel = () => null;
export const MemoryPanel = () => null;
export const ScreenCaptureButton = () => null;

export const ErrorBoundary = ({ children }: { children: React.ReactNode }) => children;
export const TimeoutWarningDialog = () => null;
export const DiffViewer = () => null;
export const handleSlashCommand = () => {};

/** Back-compat: old stub exported selectBudget with this fallback shape */
export const _selectBudgetLegacy = (_state: BillingUsageState): BudgetState => ({
  enabled: false,
  dailyBudget: 0,
  monthlyBudget: 0,
  spent: 0,
});
