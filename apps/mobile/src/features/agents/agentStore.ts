/**
 * Agent feature store — enhanced agent state management for the live dashboard.
 *
 * Extends the base agentStore with:
 * - Tool execution history per agent
 * - Filtered approval queue views
 * - Agent grouping (active vs. completed)
 * - Push notification triggers for approvals
 * - Time-based statistics
 *
 * This store works alongside (not replacing) the base stores/agentStore.ts
 * which handles the raw agent state from the WebRTC data channel.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import { useAgentStore, type Agent } from '@/stores/agentStore';
import { useConnectionStore } from '@/stores/connectionStore';
import type { ApprovalRequest, ToolCall } from '@/types/chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolExecution {
  id: string;
  agentId: string;
  toolName: string;
  displayName: string;
  args?: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  resultPreview?: string;
}

export interface AgentStats {
  totalAgents: number;
  runningCount: number;
  waitingCount: number;
  completedCount: number;
  failedCount: number;
  pendingApprovalCount: number;
  averageProgressPercent: number;
}

export type AgentSortField = 'name' | 'status' | 'progress' | 'startedAt';

export type AgentFilterStatus = 'all' | 'running' | 'waiting' | 'completed' | 'failed';

interface AgentDashboardState {
  /** Tool execution history per agent, keyed by agent ID */
  toolHistory: Record<string, ToolExecution[]>;
  /** Currently expanded agent in the dashboard */
  expandedAgentId: string | null;
  /** Active filter for agent status */
  filterStatus: AgentFilterStatus;
  /** Sort field */
  sortField: AgentSortField;
  /** Whether to auto-scroll to new approvals */
  autoScrollToApprovals: boolean;
  /** Timestamp of last notification sent (to debounce) */
  lastNotificationAt: number;

  // --- Actions ---
  addToolExecution: (execution: ToolExecution) => void;
  updateToolExecution: (id: string, patch: Partial<ToolExecution>) => void;
  setExpandedAgent: (id: string | null) => void;
  setFilterStatus: (filter: AgentFilterStatus) => void;
  setSortField: (field: AgentSortField) => void;
  setAutoScrollToApprovals: (enabled: boolean) => void;
  clearToolHistory: (agentId?: string) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAgentDashboardStore = create<AgentDashboardState>()(
  persist(
    (set) => ({
      toolHistory: {},
      expandedAgentId: null,
      filterStatus: 'all',
      sortField: 'startedAt',
      autoScrollToApprovals: true,
      lastNotificationAt: 0,

      addToolExecution: (execution) =>
        set((state) => {
          const existing = state.toolHistory[execution.agentId] ?? [];
          // Cap history at 100 entries per agent
          const updated =
            existing.length >= 100 ? [...existing.slice(-99), execution] : [...existing, execution];
          return {
            toolHistory: {
              ...state.toolHistory,
              [execution.agentId]: updated,
            },
          };
        }),

      updateToolExecution: (id, patch) =>
        set((state) => {
          const newHistory: Record<string, ToolExecution[]> = {};
          for (const [agentId, executions] of Object.entries(state.toolHistory)) {
            newHistory[agentId] = executions.map((exec) =>
              exec.id === id ? { ...exec, ...patch } : exec,
            );
          }
          return { toolHistory: newHistory };
        }),

      setExpandedAgent: (id) => set({ expandedAgentId: id }),
      setFilterStatus: (filter) => set({ filterStatus: filter }),
      setSortField: (field) => set({ sortField: field }),
      setAutoScrollToApprovals: (enabled) => set({ autoScrollToApprovals: enabled }),

      clearToolHistory: (agentId) =>
        set((state) => {
          if (agentId) {
            const { [agentId]: _, ...rest } = state.toolHistory;
            return { toolHistory: rest };
          }
          return { toolHistory: {} };
        }),
    }),
    {
      name: 'agent-dashboard-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        filterStatus: state.filterStatus,
        sortField: state.sortField,
        autoScrollToApprovals: state.autoScrollToApprovals,
      }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Derived selectors (pure functions, no hooks)
// ---------------------------------------------------------------------------

/**
 * Get computed agent statistics from the base agent store.
 */
export function getAgentStats(): AgentStats {
  const { agents, pendingApprovals } = useAgentStore.getState();
  const running = agents.filter((a) => a.status === 'running');
  const waiting = agents.filter((a) => a.status === 'waiting');
  const completed = agents.filter((a) => a.status === 'completed');
  const failed = agents.filter((a) => a.status === 'failed');
  const pending = pendingApprovals.filter((r) => r.status === 'pending');

  const avgProgress =
    agents.length > 0 ? agents.reduce((sum, a) => sum + a.progress, 0) / agents.length : 0;

  return {
    totalAgents: agents.length,
    runningCount: running.length,
    waitingCount: waiting.length,
    completedCount: completed.length,
    failedCount: failed.length,
    pendingApprovalCount: pending.length,
    averageProgressPercent: Math.round(avgProgress),
  };
}

/**
 * Filter and sort agents based on dashboard state.
 */
export function getFilteredAgents(agents: Agent[]): Agent[] {
  const { filterStatus, sortField } = useAgentDashboardStore.getState();

  let filtered = agents;

  if (filterStatus !== 'all') {
    filtered = agents.filter((a) => a.status === filterStatus);
  }

  return [...filtered].sort((a, b) => {
    switch (sortField) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'status': {
        const statusOrder = { running: 0, waiting: 1, failed: 2, completed: 3 };
        return statusOrder[a.status] - statusOrder[b.status];
      }
      case 'progress':
        return b.progress - a.progress;
      case 'startedAt':
      default:
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    }
  });
}

/**
 * Get tool executions for a specific agent, sorted newest-first.
 */
export function getAgentToolHistory(agentId: string): ToolExecution[] {
  const { toolHistory } = useAgentDashboardStore.getState();
  const history = toolHistory[agentId] ?? [];
  return [...history].reverse();
}

/**
 * Get all pending approval requests.
 */
export function getPendingApprovals(): ApprovalRequest[] {
  return useAgentStore.getState().pendingApprovals.filter((r) => r.status === 'pending');
}

/**
 * Send an agent command to the desktop.
 */
export function sendAgentCommand(agentId: string, command: 'pause' | 'resume' | 'cancel'): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected') return;

  sendControl('agent_command', {
    agentId,
    command,
    sentAt: new Date().toISOString(),
  });
}
