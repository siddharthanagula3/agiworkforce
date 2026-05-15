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

export interface BudgetSliceState {
  budget: TokenBudget;
  budgetAlerts: BudgetAlert[];
}

export interface BudgetSliceActions {
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

export type BudgetSlice = BudgetSliceState & BudgetSliceActions;

export function calculatePeriodEnd(periodStart: number, period: BudgetPeriod): number {
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

function capAlerts(alerts: BudgetAlert[]): BudgetAlert[] {
  if (alerts.length <= 100) return alerts;
  const hasDismissed = alerts.some((a) => a.dismissed);
  if (hasDismissed) {
    return alerts
      .sort((a, b) => {
        if (a.dismissed !== b.dismissed) return a.dismissed ? 1 : -1;
        return b.timestamp - a.timestamp;
      })
      .slice(0, 100);
  }
  return alerts.slice(-100);
}

function pushAlert(
  alerts: BudgetAlert[],
  type: BudgetAlert['type'],
  message: string,
): BudgetAlert[] {
  if (alerts.find((a) => a.type === type && !a.dismissed)) return alerts;
  return capAlerts([
    ...alerts,
    { id: `${type}-${Date.now()}`, type, message, timestamp: Date.now(), dismissed: false },
  ]);
}

export const createBudgetSlice = (
  set: (fn: (state: BudgetSlice) => BudgetSlice | Partial<BudgetSlice>) => void,
  get: () => BudgetSlice,
): BudgetSlice => ({
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

  setBudgetEnabled: (enabled) => {
    set((state) => {
      const budget = { ...state.budget, enabled };
      if (enabled && state.budget.currentUsage === 0) {
        const now = Date.now();
        budget.periodStart = now;
        budget.periodEnd = calculatePeriodEnd(now, state.budget.period);
      }
      return { budget };
    });
  },

  setBudgetPeriod: (period) => {
    set((state) => {
      const now = Date.now();
      return {
        budget: {
          ...state.budget,
          period,
          periodStart: now,
          periodEnd: calculatePeriodEnd(now, period),
          currentUsage: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
        },
        budgetAlerts: [],
      };
    });
  },

  setBudgetLimit: (limit) => set((state) => ({ budget: { ...state.budget, limit } })),

  setWarningThreshold: (threshold) =>
    set((state) => ({
      budget: { ...state.budget, warningThreshold: Math.min(100, Math.max(0, threshold)) },
    })),

  addTokenUsage: (tokens) => {
    set((state) => {
      if (!state.budget.enabled) return {};
      let budget = { ...state.budget };
      let alerts = [...state.budgetAlerts];
      if (shouldResetPeriod(budget)) {
        const now = Date.now();
        budget = {
          ...budget,
          periodStart: now,
          periodEnd: calculatePeriodEnd(now, budget.period),
          currentUsage: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
        };
        alerts = [];
      }
      budget.currentUsage += tokens;
      const pct = (budget.currentUsage / budget.limit) * 100;
      if (pct >= 100) {
        alerts = pushAlert(
          alerts,
          'exceeded',
          `Token budget exceeded! Used ${budget.currentUsage.toLocaleString()} of ${budget.limit.toLocaleString()} tokens.`,
        );
      } else if (pct >= 90) {
        alerts = pushAlert(
          alerts,
          'danger',
          `Token budget at ${pct.toFixed(0)}%! Only ${(budget.limit - budget.currentUsage).toLocaleString()} tokens remaining.`,
        );
      } else if (pct >= budget.warningThreshold) {
        alerts = pushAlert(
          alerts,
          'warning',
          `Token budget at ${pct.toFixed(0)}%. You've used ${budget.currentUsage.toLocaleString()} of ${budget.limit.toLocaleString()} tokens.`,
        );
      }
      return { budget, budgetAlerts: alerts };
    });
  },

  addDetailedTokenUsage: (details) => {
    set((state) => {
      if (!state.budget.enabled) return {};
      let budget = { ...state.budget };
      let alerts = [...state.budgetAlerts];
      if (shouldResetPeriod(budget)) {
        const now = Date.now();
        budget = {
          ...budget,
          periodStart: now,
          periodEnd: calculatePeriodEnd(now, budget.period),
          currentUsage: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
        };
        alerts = [];
      }
      const totalTokens = details.inputTokens + details.outputTokens;
      budget.currentUsage += totalTokens;
      budget.inputTokens += details.inputTokens;
      budget.outputTokens += details.outputTokens;
      budget.estimatedCost += details.costUsd || 0;
      const pct = (budget.currentUsage / budget.limit) * 100;
      if (pct >= 100) {
        alerts = pushAlert(
          alerts,
          'exceeded',
          `Token budget exceeded! Used ${budget.currentUsage.toLocaleString()} of ${budget.limit.toLocaleString()} tokens (Input: ${budget.inputTokens.toLocaleString()}, Output: ${budget.outputTokens.toLocaleString()}). Est. cost: $${budget.estimatedCost.toFixed(4)}`,
        );
      } else if (pct >= 90) {
        alerts = pushAlert(
          alerts,
          'danger',
          `Token budget at ${pct.toFixed(0)}%! Only ${(budget.limit - budget.currentUsage).toLocaleString()} tokens remaining. Est. cost: $${budget.estimatedCost.toFixed(4)}`,
        );
      } else if (pct >= budget.warningThreshold) {
        alerts = pushAlert(
          alerts,
          'warning',
          `Token budget at ${pct.toFixed(0)}%. Input: ${budget.inputTokens.toLocaleString()}, Output: ${budget.outputTokens.toLocaleString()}. Est. cost: $${budget.estimatedCost.toFixed(4)}`,
        );
      }
      return { budget, budgetAlerts: alerts };
    });
  },

  resetBudgetPeriod: () => {
    set((state) => {
      const now = Date.now();
      return {
        budget: {
          ...state.budget,
          periodStart: now,
          periodEnd: calculatePeriodEnd(now, state.budget.period),
          currentUsage: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
        },
        budgetAlerts: [],
      };
    });
  },

  dismissAlert: (alertId) =>
    set((state) => ({
      budgetAlerts: state.budgetAlerts.map((a) =>
        a.id === alertId ? { ...a, dismissed: true } : a,
      ),
    })),

  clearAlerts: () => set(() => ({ budgetAlerts: [] })),

  getBudgetInputTokens: () => get().budget.inputTokens,
  getBudgetOutputTokens: () => get().budget.outputTokens,
  getBudgetTotalTokens: () => get().budget.currentUsage,
  getEstimatedCost: () => get().budget.estimatedCost,
});
