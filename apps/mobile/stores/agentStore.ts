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
          pendingApprovals: state.pendingApprovals.filter((request) =>
            pendingIdSet.has(request.id),
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

        // Update local state
        set((state) => ({
          pendingApprovals: state.pendingApprovals.map((r) =>
            r.id === id ? { ...r, status: 'approved' as const } : r,
          ),
        }));
        // Send decision to desktop via WebRTC
        void import('@/services/companion')
          .then(({ sendApprovalResponse }) => {
            if (!sendApprovalResponse(id, true)) {
              set((state) => ({
                pendingApprovals: state.pendingApprovals.map((request) =>
                  request.id === id && request.status === 'approved'
                    ? { ...request, status: 'pending' as const }
                    : request,
                ),
              }));
            }
          })
          .catch((error) => {
            set((state) => ({
              pendingApprovals: state.pendingApprovals.map((request) =>
                request.id === id && request.status === 'approved'
                  ? { ...request, status: 'pending' as const }
                  : request,
              ),
            }));
            console.warn('[agentStore] Failed to send approval response:', error);
          });
      },

      rejectRequest: (id, reason) => {
        const approval = get().pendingApprovals.find((request) => request.id === id);
        if (!approval || approval.status !== 'pending') return;

        // Update local state
        set((state) => ({
          pendingApprovals: state.pendingApprovals.map((r) =>
            r.id === id ? { ...r, status: 'rejected' as const } : r,
          ),
        }));
        // Send decision to desktop via WebRTC
        void import('@/services/companion')
          .then(({ sendApprovalResponse }) => {
            if (!sendApprovalResponse(id, false, reason)) {
              set((state) => ({
                pendingApprovals: state.pendingApprovals.map((request) =>
                  request.id === id && request.status === 'rejected'
                    ? { ...request, status: 'pending' as const }
                    : request,
                ),
              }));
            }
          })
          .catch((error) => {
            set((state) => ({
              pendingApprovals: state.pendingApprovals.map((request) =>
                request.id === id && request.status === 'rejected'
                  ? { ...request, status: 'pending' as const }
                  : request,
              ),
            }));
            console.warn('[agentStore] Failed to send rejection response:', error);
          });
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
