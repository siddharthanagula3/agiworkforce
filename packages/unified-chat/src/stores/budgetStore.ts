/**
 * Budget + usage tracking store for unified-chat.
 *
 * Surface-agnostic: hosts (apps/desktop, apps/web, apps/mobile) push their
 * own token / dollar / message-count snapshot via `setBudget`, and push
 * tool-call activity into the action trail via `pushAction`. The store is
 * a passive consumer — it does not call any backend, hold any auth token,
 * or know about Stripe / Supabase / Tauri.
 *
 * Companion components: BudgetTracker (auto-counts last message tokens),
 * BudgetAlertsPanel, TokenCounter, UsageLimitBanner, CurrentActionBadge.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { generateId } from '../lib/utils';

/**
 * Snapshot of the user's current budget window. Units are decided by the host
 * (tokens, dollars, message-count) — components render the value as-is.
 */
export interface BudgetSnapshot {
  /** When false, BudgetTracker no-ops and UsageLimitBanner stays hidden. */
  enabled: boolean;
  currentUsage: number;
  /** Hard limit (matches `currentUsage` unit). 0 ⇒ unlimited. */
  limit: number;
  /** Period reset epoch ms (when the window rolls over). */
  periodEnd: number;
  /** Optional input/output split for the current message — visual only. */
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Alert pushed by the host when the user crosses a threshold. Components
 * render alerts in chronological order; users can dismiss individually.
 */
export interface BudgetAlert {
  id: string;
  type: 'warning' | 'danger' | 'exceeded';
  message: string;
  timestamp: number;
  dismissed: boolean;
}

/** Type of the most-recent agent-loop step shown in CurrentActionBadge. */
export type ActionTrailEntryType =
  | 'thinking'
  | 'searching'
  | 'coding'
  | 'running'
  | 'completed'
  | 'error';

/**
 * One step in the agent's action trail. Hosts should `pushAction` whenever
 * a tool-call fires or a phase transitions (think → search → run).
 */
export interface ActionTrailEntry {
  id: string;
  type: ActionTrailEntryType;
  message: string;
  /** ISO 8601 string. */
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

  /** Replace the budget snapshot wholesale or patch fields. */
  setBudget: (snapshot: Partial<BudgetSnapshot>) => void;
  /** Increment `currentUsage` by `tokens` (BudgetTracker uses this). */
  addTokenUsage: (tokens: number) => void;
  /** Push a new alert. Auto-assigns id / timestamp. */
  pushAlert: (alert: Pick<BudgetAlert, 'type' | 'message'>) => void;
  /** Mark an alert dismissed (so BudgetAlertsPanel hides it). */
  dismissAlert: (id: string) => void;
  /** Replace the action trail (host snapshot push). */
  setActionTrail: (entries: ActionTrailEntry[]) => void;
  /** Append one action. Auto-assigns id / timestamp. */
  pushAction: (
    entry: Pick<ActionTrailEntry, 'type' | 'message'> & Partial<ActionTrailEntry>,
  ) => void;
  /** Clear all alerts (e.g., when a new conversation starts). */
  clearAlerts: () => void;
  /** Clear the action trail (e.g., when the agent loop resets). */
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

// ── Selectors ────────────────────────────────────────────────────────────────

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

// ── Utility re-exports for component consumers ───────────────────────────────

/** Format a token count for compact display: 1234 → "1.2K", 1_500_000 → "1.5M". */
export function formatTokens(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}
