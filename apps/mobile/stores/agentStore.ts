import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { StatusStep, ToolCall, ApprovalRequest } from '@/types/chat';

/** A file or output artifact produced by an agent run */
export interface RunArtifact {
  id: string;
  type: 'file_created' | 'file_modified' | 'command_run' | 'error';
  label: string;
  detail?: string;
  timestamp: string;
}

export interface Agent {
  id: string;
  name: string;
  model: string;
  status: 'running' | 'completed' | 'failed' | 'waiting';
  currentStep: string;
  /** Current action being performed, e.g. "Running: search_files in /src" */
  currentAction?: string;
  progress: number; // 0-100
  /** Total number of steps (used for ETA calculation) */
  totalSteps?: number;
  /** Steps completed count (used for ETA calculation) */
  stepsCompleted?: number;
  steps: StatusStep[];
  toolCalls: ToolCall[];
  /** Artifacts produced during the run */
  artifacts?: RunArtifact[];
  startedAt: string;
  updatedAt: string;
}

interface AgentState {
  /** Active agents synced from desktop companion via WebRTC */
  agents: Agent[];
  /** Currently selected agent for detail view */
  selectedAgentId: string | null;
  /** Approval requests pending user action */
  pendingApprovals: ApprovalRequest[];

  setAgents: (agents: Agent[]) => void;
  updateAgent: (id: string, patch: Partial<Omit<Agent, 'id'>>) => void;
  removeAgent: (id: string) => void;
  selectAgent: (id: string | null) => void;
  clearCompleted: () => void;

  /** Approval actions */
  addApproval: (approval: ApprovalRequest) => void;
  reconcileApprovals: (pendingIds: string[]) => void;
  removeApproval: (id: string) => void;
  approveRequest: (id: string) => void;
  rejectRequest: (id: string, reason?: string) => void;
}

const approvalResponsesInFlight = new Set<string>();

function sendApprovalDecision(id: string, approved: boolean, reason?: string): void {
  if (approvalResponsesInFlight.has(id)) return;
  approvalResponsesInFlight.add(id);
  void import('@/services/companion')
    .then(async ({ sendApprovalResponse }) => {
      const acceptedByTransport = await sendApprovalResponse(id, approved, reason);
      if (!acceptedByTransport) {
        console.warn('[agentStore] Approval response was not accepted by a transport.');
      }
    })
    .catch((error) => {
      console.warn('[agentStore] Failed to send approval response:', error);
    })
    .finally(() => approvalResponsesInFlight.delete(id));
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agents: [],
      selectedAgentId: null,
      pendingApprovals: [],

      setAgents: (agents) => set({ agents }),

      updateAgent: (id, patch) =>
        set((state) => ({
          agents: state.agents.map((agent) =>
            agent.id === id ? { ...agent, ...patch, updatedAt: new Date().toISOString() } : agent,
          ),
        })),

      removeAgent: (id) =>
        set((state) => ({
          agents: state.agents.filter((agent) => agent.id !== id),
          selectedAgentId: state.selectedAgentId === id ? null : state.selectedAgentId,
        })),

      selectAgent: (id) => set({ selectedAgentId: id }),

      clearCompleted: () =>
        set((state) => ({
          agents: state.agents.filter((a) => a.status !== 'completed'),
          selectedAgentId: state.agents.find(
            (a) => a.id === state.selectedAgentId && a.status === 'completed',
          )
            ? null
            : state.selectedAgentId,
        })),

      addApproval: (approval) =>
        set((state) => ({
          pendingApprovals: state.pendingApprovals.some((r) => r.id === approval.id)
            ? state.pendingApprovals.map((r) => (r.id === approval.id ? approval : r))
            : [...state.pendingApprovals, approval],
        })),

      reconcileApprovals: (pendingIds) => {
        const pendingIdSet = new Set(pendingIds);
        set((state) => ({
          pendingApprovals: state.pendingApprovals
            .filter((request) => pendingIdSet.has(request.id))
            .map((request) =>
              request.status === 'pending' ? request : { ...request, status: 'pending' as const },
            ),
        }));
      },

      removeApproval: (id) =>
        set((state) => ({
          pendingApprovals: state.pendingApprovals.filter((request) => request.id !== id),
        })),

      approveRequest: (id) => {
        const approval = get().pendingApprovals.find((request) => request.id === id);
        if (!approval || approval.status !== 'pending') return;
        // Keep the request visibly pending until Desktop closes it with the
        // protocol-level `approval_closed` event. Local transport acceptance
        // alone is not proof that the privileged action was resolved.
        sendApprovalDecision(id, true);
      },

      rejectRequest: (id, reason) => {
        const approval = get().pendingApprovals.find((request) => request.id === id);
        if (!approval || approval.status !== 'pending') return;
        sendApprovalDecision(id, false, reason);
      },
    }),
    {
      name: 'agent-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[agentStore] Hydration failed:', error);
      },
      partialize: () => ({
        agents: [],
        selectedAgentId: null,
        pendingApprovals: [],
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useAgentStore, 'agent-store');
