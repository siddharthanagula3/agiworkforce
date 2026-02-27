import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import type { StatusStep } from '@/types/chat';

export interface Agent {
  id: string;
  name: string;
  model: string;
  status: 'running' | 'completed' | 'failed' | 'waiting';
  currentStep: string;
  progress: number; // 0-100
  steps: StatusStep[];
  startedAt: string;
}

interface AgentState {
  /** Active agents synced from desktop companion via WebRTC */
  agents: Agent[];
  /** Currently selected agent for detail view */
  selectedAgentId: string | null;

  setAgents: (agents: Agent[]) => void;
  updateAgent: (id: string, patch: Partial<Omit<Agent, 'id'>>) => void;
  removeAgent: (id: string) => void;
  selectAgent: (id: string | null) => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      agents: [],
      selectedAgentId: null,

      setAgents: (agents) => set({ agents }),

      updateAgent: (id, patch) =>
        set((state) => ({
          agents: state.agents.map((agent) =>
            agent.id === id ? { ...agent, ...patch } : agent,
          ),
        })),

      removeAgent: (id) =>
        set((state) => ({
          agents: state.agents.filter((agent) => agent.id !== id),
          selectedAgentId:
            state.selectedAgentId === id ? null : state.selectedAgentId,
        })),

      selectAgent: (id) => set({ selectedAgentId: id }),
    }),
    {
      name: 'agent-store',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
