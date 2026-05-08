/**
 * agentLoopStore — surface-agnostic state for the agentic execution loop.
 *
 * Hosts push snapshots via setAgentLoop / setActiveGoal. Components read
 * these reactively. No Tauri, no Supabase, no auth token.
 *
 * Covers:
 *   - AgenticLoopStatusBar: active / iteration / maxIterations
 *   - AgentProgressFooter: ActiveGoal (description, step counts, progress)
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ── AgenticLoopStatus ─────────────────────────────────────────────────────────

/**
 * Mirrors `chatStore.agenticLoopStatus` from apps/desktop — subset needed for
 * the status bar. The `conversationId` field is intentionally omitted because
 * unified-chat is surface-agnostic (conversation identity is host-managed).
 */
export interface AgentLoopStatus {
  active: boolean;
  iteration: number;
  maxIterations: number;
  /** Optional human-readable phase label (e.g. "planning", "executing"). */
  phase?: string;
}

// ── ActiveGoal (AgentProgressFooter) ─────────────────────────────────────────

/**
 * Mirrors `executionStore.ActiveGoal` from apps/desktop.
 * Hosts push this when an execution goal starts/updates/finishes.
 */
export interface ActiveGoal {
  id: string;
  description: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  /** Unix timestamp (ms) when the goal started, used for elapsed timer. */
  startTime: number;
  totalSteps: number;
  completedSteps: number;
  /** 0–100. If 0 and totalSteps > 0, footer computes ratio from step counts. */
  progressPercent: number;
}

// ── ActionLogEntry ────────────────────────────────────────────────────────────

/**
 * Mirrors `toolStore.ActionLogEntry` from apps/desktop.
 * Used by ActionLogTimeline to render agent activity entries.
 */
export type ActionLogEntryType =
  | 'plan'
  | 'terminal'
  | 'filesystem'
  | 'browser'
  | 'ui'
  | 'mcp'
  | 'approval'
  | 'metrics';

export type ActionLogStatus = 'pending' | 'running' | 'success' | 'failed' | 'blocked';

export interface ActionLogEntry {
  id: string;
  actionId?: string;
  type: ActionLogEntryType;
  title: string;
  description?: string;
  status: ActionLogStatus;
  createdAt: Date;
  updatedAt: Date;
  requiresApproval?: boolean;
  metadata?: Record<string, unknown>;
  result?: string;
  error?: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface AgentLoopState {
  agentLoop: AgentLoopStatus | null;
  activeGoal: ActiveGoal | null;
  /** Per-message action-log entries. Key = messageId. */
  actionLogByMessage: Record<string, ActionLogEntry[]>;

  /** Replace (or clear) the agentic loop status. */
  setAgentLoop: (status: AgentLoopStatus | null) => void;
  /** Replace (or clear) the active goal. */
  setActiveGoal: (goal: ActiveGoal | null) => void;
  /** Push or replace action-log entries for a message. */
  setActionLog: (messageId: string, entries: ActionLogEntry[]) => void;
  /** Append a single action-log entry for a message. */
  pushActionLogEntry: (messageId: string, entry: ActionLogEntry) => void;
  /** Update fields of an existing action-log entry by id. */
  updateActionLogEntry: (messageId: string, id: string, updates: Partial<ActionLogEntry>) => void;
  /** Clear action log for a message (e.g., on conversation reset). */
  clearActionLog: (messageId: string) => void;
}

export const useAgentLoopStore = create<AgentLoopState>()(
  immer((set) => ({
    agentLoop: null,
    activeGoal: null,
    actionLogByMessage: {},

    setAgentLoop: (status) =>
      set((state) => {
        state.agentLoop = status;
      }),

    setActiveGoal: (goal) =>
      set((state) => {
        state.activeGoal = goal;
      }),

    setActionLog: (messageId, entries) =>
      set((state) => {
        state.actionLogByMessage[messageId] = entries;
      }),

    pushActionLogEntry: (messageId, entry) =>
      set((state) => {
        if (!state.actionLogByMessage[messageId]) {
          state.actionLogByMessage[messageId] = [];
        }
        state.actionLogByMessage[messageId]!.push(entry);
      }),

    updateActionLogEntry: (messageId, id, updates) =>
      set((state) => {
        const log = state.actionLogByMessage[messageId];
        if (!log) return;
        const idx = log.findIndex((e) => e.id === id);
        if (idx === -1) return;
        Object.assign(log[idx]!, updates);
      }),

    clearActionLog: (messageId) =>
      set((state) => {
        delete state.actionLogByMessage[messageId];
      }),
  })),
);

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectAgentLoop = (state: AgentLoopState): AgentLoopStatus | null => state.agentLoop;

export const selectActiveGoal = (state: AgentLoopState): ActiveGoal | null => state.activeGoal;

export const selectActionLog =
  (messageId: string) =>
  (state: AgentLoopState): ActionLogEntry[] =>
    state.actionLogByMessage[messageId] ?? [];
