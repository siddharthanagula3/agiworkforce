/**
 * Swarm Store
 *
 * Manages the parallel agent swarm orchestrator. Users can initialize a swarm
 * of agents, execute complex goals via task decomposition, monitor stats,
 * and stop the swarm.
 *
 * Differentiator: Proprietary multi-agent orchestration platform — no competitor
 * offers parallel agent swarms with native desktop integration.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import { toast } from 'sonner';
import { getSimpleErrorMessage } from '../lib/errorMessages';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SwarmInitRequest {
  maxAgents: number;
  autoSpawn: boolean;
  optimizeCriticalPath: boolean;
}

export interface SwarmGoalRequest {
  goal: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface SwarmResult {
  success: boolean;
  output?: string;
  agentsUsed: number;
  totalDurationMs: number;
  subtaskResults: SubtaskResult[];
}

export interface SubtaskResult {
  id: string;
  description: string;
  status: string;
  output?: string;
  durationMs: number;
}

export interface SwarmStats {
  totalAgents: number;
  activeAgents: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskDurationMs: number;
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface SwarmState {
  isInitialized: boolean;
  isExecuting: boolean;
  isLoading: boolean;
  error: string | null;
  lastResult: SwarmResult | null;
  stats: SwarmStats | null;

  init: (request: SwarmInitRequest) => Promise<void>;
  executeGoal: (request: SwarmGoalRequest) => Promise<SwarmResult>;
  getStats: () => Promise<SwarmStats>;
  stop: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  isInitialized: false,
  isExecuting: false,
  isLoading: false,
  error: null,
  lastResult: null,
  stats: null,
};

export const useSwarmStore = create<SwarmState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      init: async (request) => {
        set({ isLoading: true, error: null });
        try {
          await invoke('swarm_init', { request });
          set({ isInitialized: true, isLoading: false });
          toast.success(`Swarm initialized with max ${request.maxAgents} agents`);
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isLoading: false });
          toast.error(`Swarm init failed: ${msg}`);
          throw error;
        }
      },

      executeGoal: async (request) => {
        if (!get().isInitialized) {
          const msg = 'Swarm not initialized';
          set({ error: msg });
          toast.error(msg);
          throw new Error(msg);
        }
        set({ isExecuting: true, error: null });
        try {
          const result = await invoke<SwarmResult>('swarm_execute_goal', { request });
          set({ lastResult: result, isExecuting: false });
          if (result.success) {
            toast.success(`Swarm completed goal with ${result.agentsUsed} agents`);
          } else {
            toast.warning('Swarm completed with issues');
          }
          return result;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isExecuting: false });
          toast.error(`Swarm execution failed: ${msg}`);
          throw error;
        }
      },

      getStats: async () => {
        try {
          const stats = await invoke<SwarmStats>('swarm_get_stats');
          set({ stats });
          return stats;
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg });
          throw error;
        }
      },

      stop: async () => {
        set({ isLoading: true, error: null });
        try {
          await invoke('swarm_stop');
          set({ isInitialized: false, isExecuting: false, isLoading: false });
          toast.success('Swarm stopped');
        } catch (error) {
          const msg = getSimpleErrorMessage(error);
          set({ error: msg, isLoading: false });
          toast.error(`Failed to stop swarm: ${msg}`);
          throw error;
        }
      },

      clearError: () => set({ error: null }),
      reset: () => set(initialState),
    }),
    { name: 'SwarmStore' },
  ),
);

// ── Selectors ──────────────────────────────────────────────────────────────────

export const selectSwarmInitialized = (state: SwarmState) => state.isInitialized;
export const selectSwarmExecuting = (state: SwarmState) => state.isExecuting;
export const selectSwarmStats = (state: SwarmState) => state.stats;
export const selectSwarmLastResult = (state: SwarmState) => state.lastResult;
export const selectSwarmError = (state: SwarmState) => state.error;
