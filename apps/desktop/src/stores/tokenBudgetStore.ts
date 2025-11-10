/**
 * Token Budget System
 *
 * Manages token usage budgets and alerts users when approaching limits.
 * Similar to cost management in Claude Code and Cursor.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'per-conversation';

export interface TokenBudget {
  enabled: boolean;
  period: BudgetPeriod;
  limit: number; // Token limit
  warningThreshold: number; // Percentage (e.g., 80 means warn at 80%)
  currentUsage: number; // Tokens used in current period
  periodStart: number; // Timestamp when period started
  periodEnd: number; // Timestamp when period ends
}

export interface BudgetAlert {
  id: string;
  type: 'warning' | 'danger' | 'exceeded';
  message: string;
  timestamp: number;
  dismissed: boolean;
}

interface TokenBudgetState {
  budget: TokenBudget;
  alerts: BudgetAlert[];

  // Actions
  setBudgetEnabled: (enabled: boolean) => void;
  setBudgetPeriod: (period: BudgetPeriod) => void;
  setBudgetLimit: (limit: number) => void;
  setWarningThreshold: (threshold: number) => void;
  addTokenUsage: (tokens: number) => void;
  resetPeriod: () => void;
  dismissAlert: (alertId: string) => void;
  clearAlerts: () => void;
}

const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const budgetStorage = createJSONStorage<{
  budget: TokenBudget;
  alerts: BudgetAlert[];
}>(() => (typeof window === 'undefined' ? storageFallback : window.localStorage));

// Calculate period end based on period type
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
      start.setMonth(start.getMonth() + 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'per-conversation':
      // For per-conversation, end is set when conversation ends
      return periodStart + 365 * 24 * 60 * 60 * 1000; // 1 year from now (effectively no end)
  }

  return start.getTime();
}

// Check if period has expired and should be reset
function shouldResetPeriod(budget: TokenBudget): boolean {
  if (budget.period === 'per-conversation') {
    return false; // Per-conversation budgets don't auto-reset
  }
  return Date.now() >= budget.periodEnd;
}

export const useTokenBudgetStore = create<TokenBudgetState>()(
  persist(
    immer((set) => ({
      budget: {
        enabled: false,
        period: 'daily',
        limit: 100000, // 100K tokens
        warningThreshold: 80, // Warn at 80%
        currentUsage: 0,
        periodStart: Date.now(),
        periodEnd: calculatePeriodEnd(Date.now(), 'daily'),
      },
      alerts: [],

      setBudgetEnabled: (enabled: boolean) => {
        set((state) => {
          state.budget.enabled = enabled;
          if (enabled && state.budget.currentUsage === 0) {
            // Reset period when enabling
            const now = Date.now();
            state.budget.periodStart = now;
            state.budget.periodEnd = calculatePeriodEnd(now, state.budget.period);
          }
        });
      },

      setBudgetPeriod: (period: BudgetPeriod) => {
        set((state) => {
          state.budget.period = period;
          // Reset period when changing type
          const now = Date.now();
          state.budget.periodStart = now;
          state.budget.periodEnd = calculatePeriodEnd(now, period);
          state.budget.currentUsage = 0;
          state.alerts = [];
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

          // Check if period should be reset
          if (shouldResetPeriod(state.budget)) {
            const now = Date.now();
            state.budget.periodStart = now;
            state.budget.periodEnd = calculatePeriodEnd(now, state.budget.period);
            state.budget.currentUsage = 0;
            state.alerts = [];
          }

          // Add usage
          state.budget.currentUsage += tokens;

          // Calculate percentage
          const percentage = (state.budget.currentUsage / state.budget.limit) * 100;

          // Create alerts based on usage
          if (percentage >= 100) {
            // Budget exceeded
            const existingExceeded = state.alerts.find(
              (a) => a.type === 'exceeded' && !a.dismissed,
            );
            if (!existingExceeded) {
              state.alerts.push({
                id: `exceeded-${Date.now()}`,
                type: 'exceeded',
                message: `Token budget exceeded! Used ${state.budget.currentUsage.toLocaleString()} of ${state.budget.limit.toLocaleString()} tokens.`,
                timestamp: Date.now(),
                dismissed: false,
              });
            }
          } else if (percentage >= 90) {
            // Danger zone
            const existingDanger = state.alerts.find((a) => a.type === 'danger' && !a.dismissed);
            if (!existingDanger) {
              state.alerts.push({
                id: `danger-${Date.now()}`,
                type: 'danger',
                message: `Token budget at ${percentage.toFixed(0)}%! Only ${(state.budget.limit - state.budget.currentUsage).toLocaleString()} tokens remaining.`,
                timestamp: Date.now(),
                dismissed: false,
              });
            }
          } else if (percentage >= state.budget.warningThreshold) {
            // Warning threshold
            const existingWarning = state.alerts.find((a) => a.type === 'warning' && !a.dismissed);
            if (!existingWarning) {
              state.alerts.push({
                id: `warning-${Date.now()}`,
                type: 'warning',
                message: `Token budget at ${percentage.toFixed(0)}%. You've used ${state.budget.currentUsage.toLocaleString()} of ${state.budget.limit.toLocaleString()} tokens.`,
                timestamp: Date.now(),
                dismissed: false,
              });
            }
          }
        });
      },

      resetPeriod: () => {
        set((state) => {
          const now = Date.now();
          state.budget.periodStart = now;
          state.budget.periodEnd = calculatePeriodEnd(now, state.budget.period);
          state.budget.currentUsage = 0;
          state.alerts = [];
        });
      },

      dismissAlert: (alertId: string) => {
        set((state) => {
          const alert = state.alerts.find((a) => a.id === alertId);
          if (alert) {
            alert.dismissed = true;
          }
        });
      },

      clearAlerts: () => {
        set((state) => {
          state.alerts = [];
        });
      },
    })),
    {
      name: 'agiworkforce-token-budget',
      storage: budgetStorage,
    },
  ),
);

// Selectors
export const selectBudget = (state: TokenBudgetState) => state.budget;
export const selectActiveAlerts = (state: TokenBudgetState) =>
  state.alerts.filter((a) => !a.dismissed);
export const selectBudgetPercentage = (state: TokenBudgetState) =>
  (state.budget.currentUsage / state.budget.limit) * 100;
