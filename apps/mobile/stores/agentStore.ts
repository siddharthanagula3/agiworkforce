import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { StatusStep, ToolCall, ApprovalRequest } from '@/types/chat';

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
  currentAction?: string;
  progress: number;
  totalSteps?: number;
  stepsCompleted?: number;
  steps: StatusStep[];
  toolCalls: ToolCall[];
  artifacts?: RunArtifact[];
  startedAt: string;
  updatedAt: string;
}

interface AgentState {
  agents: Agent[];
  selectedAgentId: string | null;
  pendingApprovals: ApprovalRequest[];

  setAgents: (agents: Agent[]) => void;
  updateAgent: (id: string, patch: Partial<Omit<Agent, 'id'>>) => void;
  removeAgent: (id: string) => void;
  selectAgent: (id: string | null) => void;
  clearCompleted: () => void;

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
