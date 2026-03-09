/**
 * Token Budget Store
 *
 * Manages token budget enforcement, alerts, and detailed token tracking.
 * Persisted to localStorage to survive page refreshes.
 *
 * Middleware: devtools(persist(subscribeWithSelector(immer(...))))
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { storageFallback } from '../lib/storageFallback';

// ============================================================================
// Types
// ============================================================================

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

interface TokenBudgetState {
  budget: TokenBudget;
  budgetAlerts: BudgetAlert[];
}

interface TokenBudgetActions {
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
}

export type TokenBudgetStore = TokenBudgetState & TokenBudgetActions;

// ============================================================================
// Helpers
// ============================================================================

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
  if (budget.period === 'per-conversation') return false;
  return Date.now() >= budget.periodEnd;
}

const getStorage = () => (typeof window === 'undefined' ? storageFallback : window.localStorage);

/**
 * Cap budgetAlerts array at 100 entries, removing oldest dismissed alerts first (STR-001 fix)
 */
function capAlerts(alerts: BudgetAlert[]): BudgetAlert[] {
  if (alerts.length <= 100) return alerts;

  const dismissedAlerts = alerts.filter((a) => a.dismissed);
  if (dismissedAlerts.length > 0) {
    return alerts
      .sort((a, b) => {
        if (a.dismissed !== b.dismissed) return a.dismissed ? 1 : -1;
        return b.timestamp - a.timestamp;
      })
      .slice(0, 100);
  }
  return alerts.slice(-100);
}

// ============================================================================
// Store
// ============================================================================

export const useTokenBudgetStore = create<TokenBudgetStore>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          // State
          budget: {
            enabled: false,
            period: 'daily' as BudgetPeriod,
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

          // Actions
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
              if (!state.budget.enabled) return;

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
                const existing = state.budgetAlerts.find(
                  (a) => a.type === 'exceeded' && !a.dismissed,
                );
                if (!existing) {
                  state.budgetAlerts.push({
                    id: `exceeded-${Date.now()}`,
                    type: 'exceeded',
                    message: `Token budget exceeded! Used ${state.budget.currentUsage.toLocaleString()} of ${state.budget.limit.toLocaleString()} tokens.`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              } else if (percentage >= 90) {
                const existing = state.budgetAlerts.find(
                  (a) => a.type === 'danger' && !a.dismissed,
                );
                if (!existing) {
                  state.budgetAlerts.push({
                    id: `danger-${Date.now()}`,
                    type: 'danger',
                    message: `Token budget at ${percentage.toFixed(0)}%! Only ${(state.budget.limit - state.budget.currentUsage).toLocaleString()} tokens remaining.`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              } else if (percentage >= state.budget.warningThreshold) {
                const existing = state.budgetAlerts.find(
                  (a) => a.type === 'warning' && !a.dismissed,
                );
                if (!existing) {
                  state.budgetAlerts.push({
                    id: `warning-${Date.now()}`,
                    type: 'warning',
                    message: `Token budget at ${percentage.toFixed(0)}%. You've used ${state.budget.currentUsage.toLocaleString()} of ${state.budget.limit.toLocaleString()} tokens.`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              }

              state.budgetAlerts = capAlerts(state.budgetAlerts);
            });
          },

          addDetailedTokenUsage: (details: TokenUsageDetails) => {
            set((state) => {
              if (!state.budget.enabled) return;

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
                const existing = state.budgetAlerts.find(
                  (a) => a.type === 'exceeded' && !a.dismissed,
                );
                if (!existing) {
                  state.budgetAlerts.push({
                    id: `exceeded-${Date.now()}`,
                    type: 'exceeded',
                    message: `Token budget exceeded! Used ${state.budget.currentUsage.toLocaleString()} of ${state.budget.limit.toLocaleString()} tokens (Input: ${state.budget.inputTokens.toLocaleString()}, Output: ${state.budget.outputTokens.toLocaleString()}). Est. cost: $${state.budget.estimatedCost.toFixed(4)}`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              } else if (percentage >= 90) {
                const existing = state.budgetAlerts.find(
                  (a) => a.type === 'danger' && !a.dismissed,
                );
                if (!existing) {
                  state.budgetAlerts.push({
                    id: `danger-${Date.now()}`,
                    type: 'danger',
                    message: `Token budget at ${percentage.toFixed(0)}%! Only ${(state.budget.limit - state.budget.currentUsage).toLocaleString()} tokens remaining. Est. cost: $${state.budget.estimatedCost.toFixed(4)}`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              } else if (percentage >= state.budget.warningThreshold) {
                const existing = state.budgetAlerts.find(
                  (a) => a.type === 'warning' && !a.dismissed,
                );
                if (!existing) {
                  state.budgetAlerts.push({
                    id: `warning-${Date.now()}`,
                    type: 'warning',
                    message: `Token budget at ${percentage.toFixed(0)}%. Input: ${state.budget.inputTokens.toLocaleString()}, Output: ${state.budget.outputTokens.toLocaleString()}. Est. cost: $${state.budget.estimatedCost.toFixed(4)}`,
                    timestamp: Date.now(),
                    dismissed: false,
                  });
                }
              }

              state.budgetAlerts = capAlerts(state.budgetAlerts);
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
              if (alert) alert.dismissed = true;
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
        })),
      ),
      {
        name: 'billing-usage-store',
        version: 1,
        storage: createJSONStorage(() => getStorage()),
        partialize: (state) => ({
          budget: state.budget,
          budgetAlerts: state.budgetAlerts,
        }),
        migrate: (persistedState: unknown, _version: number) => {
          return persistedState as TokenBudgetState;
        },
      },
    ),
    { name: 'TokenBudgetStore', enabled: import.meta.env.DEV },
  ),
);

// ============================================================================
// Selectors
// ============================================================================

export const selectBudget = (state: TokenBudgetStore) => state.budget;
export const selectActiveAlerts = (state: TokenBudgetStore) =>
  state.budgetAlerts.filter((a) => !a.dismissed);
export const selectBudgetPercentage = (state: TokenBudgetStore) =>
  (state.budget.currentUsage / state.budget.limit) * 100;
export const selectInputTokens = (state: TokenBudgetStore) => state.budget.inputTokens;
export const selectOutputTokens = (state: TokenBudgetStore) => state.budget.outputTokens;
export const selectEstimatedCost = (state: TokenBudgetStore) => state.budget.estimatedCost;
export const selectTokenBreakdown = (state: TokenBudgetStore) => ({
  total: state.budget.currentUsage,
  input: state.budget.inputTokens,
  output: state.budget.outputTokens,
  cost: state.budget.estimatedCost,
  percentage: (state.budget.currentUsage / state.budget.limit) * 100,
});
