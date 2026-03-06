import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import { useConnectionStore } from '@/stores/connectionStore';
import type { StatusStep, ToolCall, ApprovalRequest } from '@/types/chat';

export interface Agent {
  id: string;
  name: string;
  model: string;
  status: 'running' | 'completed' | 'failed' | 'waiting';
  currentStep: string;
  progress: number; // 0-100
  steps: StatusStep[];
  toolCalls: ToolCall[];
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
  approveRequest: (id: string) => void;
  rejectRequest: (id: string, reason?: string) => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
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
          pendingApprovals: [...state.pendingApprovals, approval],
        })),

      approveRequest: (id) => {
        // Update local state
        set((state) => ({
          pendingApprovals: state.pendingApprovals.map((r) =>
            r.id === id ? { ...r, status: 'approved' as const } : r,
          ),
        }));
        // Send decision to desktop via WebRTC
        useConnectionStore.getState().sendControl('approval_response', {
          approvalId: id,
          decision: 'approved',
        });
      },

      rejectRequest: (id, reason) => {
        // Update local state
        set((state) => ({
          pendingApprovals: state.pendingApprovals.map((r) =>
            r.id === id ? { ...r, status: 'rejected' as const } : r,
          ),
        }));
        // Send decision to desktop via WebRTC
        useConnectionStore.getState().sendControl('approval_response', {
          approvalId: id,
          decision: 'rejected',
          reason,
        });
      },
    }),
    {
      name: 'agent-store',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
