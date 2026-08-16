import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface AgentLoopStatus {
  active: boolean;
  iteration: number;
  maxIterations: number;
  phase?: string;
}

export interface ActiveGoal {
  id: string;
  description: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  startTime: number;
  totalSteps: number;
  completedSteps: number;
  progressPercent: number;
}

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

interface AgentLoopState {
  agentLoop: AgentLoopStatus | null;
  activeGoal: ActiveGoal | null;
  actionLogByMessage: Record<string, ActionLogEntry[]>;

  setAgentLoop: (status: AgentLoopStatus | null) => void;
  setActiveGoal: (goal: ActiveGoal | null) => void;
  setActionLog: (messageId: string, entries: ActionLogEntry[]) => void;
  pushActionLogEntry: (messageId: string, entry: ActionLogEntry) => void;
  updateActionLogEntry: (messageId: string, id: string, updates: Partial<ActionLogEntry>) => void;
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

export const selectAgentLoop = (state: AgentLoopState): AgentLoopStatus | null => state.agentLoop;

export const selectActiveGoal = (state: AgentLoopState): ActiveGoal | null => state.activeGoal;

export const selectActionLog =
  (messageId: string) =>
  (state: AgentLoopState): ActionLogEntry[] =>
    state.actionLogByMessage[messageId] ?? [];
