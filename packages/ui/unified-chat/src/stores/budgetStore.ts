import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { generateId } from '../lib/utils';

export interface BudgetSnapshot {
  enabled: boolean;
  currentUsage: number;
  limit: number;
  periodEnd: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface BudgetAlert {
  id: string;
  type: 'warning' | 'danger' | 'exceeded';
  message: string;
  timestamp: number;
  dismissed: boolean;
}

export type ActionTrailEntryType =
  | 'thinking'
  | 'searching'
  | 'coding'
  | 'running'
  | 'completed'
  | 'error';

export interface ActionTrailEntry {
  id: string;
  type: ActionTrailEntryType;
  message: string;
  timestamp: string;
  currentStep?: number;
  totalSteps?: number;
  progress?: number;
  metadata?: Record<string, unknown>;
}

interface BudgetState {
  budget: BudgetSnapshot;
  budgetAlerts: BudgetAlert[];
  actionTrail: ActionTrailEntry[];

  setBudget: (snapshot: Partial<BudgetSnapshot>) => void;
  addTokenUsage: (tokens: number) => void;
  pushAlert: (alert: Pick<BudgetAlert, 'type' | 'message'>) => void;
  dismissAlert: (id: string) => void;
  setActionTrail: (entries: ActionTrailEntry[]) => void;
  pushAction: (
    entry: Pick<ActionTrailEntry, 'type' | 'message'> & Partial<ActionTrailEntry>,
  ) => void;
  clearAlerts: () => void;
  clearActionTrail: () => void;
}

const DEFAULT_BUDGET: BudgetSnapshot = {
  enabled: false,
  currentUsage: 0,
  limit: 0,
  periodEnd: 0,
};

export const useBudgetStore = create<BudgetState>()(
  immer((set) => ({
    budget: DEFAULT_BUDGET,
    budgetAlerts: [],
    actionTrail: [],

    setBudget: (snapshot) =>
      set((state) => {
        state.budget = { ...state.budget, ...snapshot };
      }),

    addTokenUsage: (tokens) =>
      set((state) => {
        if (!state.budget.enabled) return;
        state.budget.currentUsage += tokens;
      }),

    pushAlert: (alert) =>
      set((state) => {
        state.budgetAlerts.push({
          id: generateId(),
          timestamp: Date.now(),
          dismissed: false,
          ...alert,
        });
      }),

    dismissAlert: (id) =>
      set((state) => {
        const target = state.budgetAlerts.find((a) => a.id === id);
        if (target) target.dismissed = true;
      }),

    setActionTrail: (entries) =>
      set((state) => {
        state.actionTrail = entries;
      }),

    pushAction: (entry) =>
      set((state) => {
        state.actionTrail.push({
          id: entry.id ?? generateId(),
          timestamp: entry.timestamp ?? new Date().toISOString(),
          type: entry.type,
          message: entry.message,
          ...(entry.currentStep !== undefined ? { currentStep: entry.currentStep } : {}),
          ...(entry.totalSteps !== undefined ? { totalSteps: entry.totalSteps } : {}),
          ...(entry.progress !== undefined ? { progress: entry.progress } : {}),
          ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
        });
      }),

    clearAlerts: () =>
      set((state) => {
        state.budgetAlerts = [];
      }),

    clearActionTrail: () =>
      set((state) => {
        state.actionTrail = [];
      }),
  })),
);

export const selectBudget = (state: BudgetState): BudgetSnapshot => state.budget;

export const selectBudgetPercentage = (state: BudgetState): number => {
  const { currentUsage, limit } = state.budget;
  if (limit <= 0) return 0;
  return Math.min(100, (currentUsage / limit) * 100);
};

export const selectActiveActions = (state: BudgetState): ActionTrailEntry[] =>
  state.actionTrail.filter((a) => ['thinking', 'searching', 'coding', 'running'].includes(a.type));

export const selectVisibleAlerts = (state: BudgetState): BudgetAlert[] =>
  state.budgetAlerts.filter((a) => !a.dismissed);

export function formatTokens(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}
