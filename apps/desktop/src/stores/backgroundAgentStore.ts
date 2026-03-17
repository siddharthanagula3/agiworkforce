/**
 * Background Agent Store
 *
 * Manages background agents — conversations pushed to the background with "&" prefix.
 * Similar to Cursor's background agent pattern but with native desktop integration.
 *
 * Differentiator: Push any conversation to background, monitor live, take back control.
 * No competitor offers this level of agent management with a desktop GUI.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import { toast } from 'sonner';
import { getSimpleErrorMessage } from '../lib/errorMessages';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BackgroundAgent {
  id: string;
  conversationId: string;
  goal: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface PushToBackgroundInput {
  conversationId: string;
  goal: string;
  workingDirectory?: string;
  conversationHistory?: MessageInput[];
  activeMcpServers?: string[];
  customInstructions?: string;
  priority?: number;
  timeoutSecs?: number;
}

export interface MessageInput {
  role: string;
  content: string;
  timestamp?: string;
}

export interface PushResponse {
  agentId: string;
  queuePosition?: number;
  started: boolean;
}

export interface ListAgentsResponse {
  agents: BackgroundAgent[];
  activeCount: number;
  maxAgents: number;
}

export interface TakeOverResponse {
  agent: BackgroundAgent;
  context: BackgroundAgentContext;
}

export interface BackgroundAgentContext {
  workingDirectory?: string;
  conversationSnapshot: Array<{ role: string; content: string; timestamp: string }>;
  activeMcpServers: string[];
  customInstructions?: string;
}

export interface BackgroundAgentStats {
  totalAgents: number;
  runningCount: number;
  queuedCount: number;
  pausedCount: number;
  completedCount: number;
  failedCount: number;
  maxAgents: number;
  atCapacity: boolean;
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface BackgroundAgentState {
  agents: BackgroundAgent[];
  activeCount: number;
  maxAgents: number;
  stats: BackgroundAgentStats | null;
  isLoading: boolean;
  error: string | null;

  pushToBackground: (input: PushToBackgroundInput) => Promise<PushResponse>;
  listAgents: () => Promise<ListAgentsResponse>;
  listActiveAgents: () => Promise<BackgroundAgent[]>;
  getAgent: (agentId: string) => Promise<BackgroundAgent | null>;
  pauseAgent: (agentId: string) => Promise<void>;
  resumeAgent: (agentId: string) => Promise<void>;
  cancelAgent: (agentId: string) => Promise<void>;
  takeOverAgent: (agentId: string) => Promise<TakeOverResponse>;
  getStats: () => Promise<BackgroundAgentStats>;
  cleanup: () => Promise<number>;
  shouldPush: (goal: string) => Promise<{ shouldPush: boolean; cleanedGoal: string }>;

  clearError: () => void;
  reset: () => void;
}

const initialState = {
  agents: [],
  activeCount: 0,
  maxAgents: 10,
  stats: null,
  isLoading: false,
  error: null,
};

export const useBackgroundAgentStore = create<BackgroundAgentState>()(
  devtools(
    (set) => ({
      ...initialState,

      pushToBackground: async (input) => {
        set({ isLoading: true, error: null });
        try {
          const response = await invoke<PushResponse>('background_agent_push', { input });
          // Refresh agent list after push
          const list = await invoke<ListAgentsResponse>('background_agent_list');
          set({
            agents: list.agents,
            activeCount: list.activeCount,
            maxAgents: list.maxAgents,
            isLoading: false,
          });
          if (response.started) {
            toast.success('Agent started in background');
          } else {
            toast.success(`Agent queued at position ${response.queuePosition}`);
          }
          return response;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isLoading: false });
          toast.error(`Failed to push to background: ${msg}`);
          throw error;
        }
      },

      listAgents: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await invoke<ListAgentsResponse>('background_agent_list');
          set({
            agents: response.agents,
            activeCount: response.activeCount,
            maxAgents: response.maxAgents,
            isLoading: false,
          });
          return response;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isLoading: false });
          throw error;
        }
      },

      listActiveAgents: async () => {
        try {
          const agents = await invoke<BackgroundAgent[]>('background_agent_list_active');
          return agents;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg });
          throw error;
        }
      },

      getAgent: async (agentId) => {
        try {
          return await invoke<BackgroundAgent | null>('background_agent_get', { agentId });
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg });
          throw error;
        }
      },

      pauseAgent: async (agentId) => {
        try {
          await invoke('background_agent_pause', { agentId });
          set((state) => ({
            agents: state.agents.map((a) =>
              a.id === agentId ? { ...a, status: 'paused' as const } : a,
            ),
          }));
          toast.success('Agent paused');
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg });
          toast.error(`Failed to pause agent: ${msg}`);
          throw error;
        }
      },

      resumeAgent: async (agentId) => {
        try {
          await invoke('background_agent_resume', { agentId });
          set((state) => ({
            agents: state.agents.map((a) =>
              a.id === agentId ? { ...a, status: 'running' as const } : a,
            ),
          }));
          toast.success('Agent resumed');
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg });
          toast.error(`Failed to resume agent: ${msg}`);
          throw error;
        }
      },

      cancelAgent: async (agentId) => {
        try {
          await invoke('background_agent_cancel', { agentId });
          set((state) => ({
            agents: state.agents.map((a) =>
              a.id === agentId ? { ...a, status: 'cancelled' as const } : a,
            ),
          }));
          toast.success('Agent cancelled');
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg });
          toast.error(`Failed to cancel agent: ${msg}`);
          throw error;
        }
      },

      takeOverAgent: async (agentId) => {
        set({ isLoading: true, error: null });
        try {
          const response = await invoke<TakeOverResponse>('background_agent_take_over', {
            agentId,
          });
          set((state) => ({
            agents: state.agents.filter((a) => a.id !== agentId),
            isLoading: false,
          }));
          toast.success('Agent taken over — restoring conversation');
          return response;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isLoading: false });
          toast.error(`Failed to take over agent: ${msg}`);
          throw error;
        }
      },

      getStats: async () => {
        try {
          const stats = await invoke<BackgroundAgentStats>('background_agent_stats');
          set({ stats });
          return stats;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg });
          throw error;
        }
      },

      cleanup: async () => {
        try {
          const count = await invoke<number>('background_agent_cleanup');
          if (count > 0) {
            // Refresh list after cleanup
            const list = await invoke<ListAgentsResponse>('background_agent_list');
            set({
              agents: list.agents,
              activeCount: list.activeCount,
            });
            toast.success(`Cleaned up ${count} old agent${count > 1 ? 's' : ''}`);
          }
          return count;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg });
          throw error;
        }
      },

      shouldPush: async (goal) => {
        try {
          const [shouldPush, cleanedGoal] = await invoke<[boolean, string]>(
            'background_agent_should_push',
            { goal },
          );
          return { shouldPush, cleanedGoal };
        } catch {
          return { shouldPush: false, cleanedGoal: goal };
        }
      },

      clearError: () => set({ error: null }),
      reset: () => set(initialState),
    }),
    { name: 'BackgroundAgentStore' },
  ),
);

// ── Selectors ──────────────────────────────────────────────────────────────────

export const selectBackgroundAgents = (state: BackgroundAgentState) => state.agents;
export const selectActiveCount = (state: BackgroundAgentState) => state.activeCount;
export const selectMaxAgents = (state: BackgroundAgentState) => state.maxAgents;
export const selectBackgroundAgentStats = (state: BackgroundAgentState) => state.stats;
export const selectBackgroundAgentLoading = (state: BackgroundAgentState) => state.isLoading;
export const selectBackgroundAgentError = (state: BackgroundAgentState) => state.error;
export const selectRunningAgents = (state: BackgroundAgentState) =>
  state.agents.filter((a) => a.status === 'running');
export const selectQueuedAgents = (state: BackgroundAgentState) =>
  state.agents.filter((a) => a.status === 'queued');
export const selectAtCapacity = (state: BackgroundAgentState) =>
  state.stats?.atCapacity ?? state.activeCount >= state.maxAgents;
