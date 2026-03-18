/**
 * Background Agent Store
 *
 * Wires all background_agent_* Tauri commands to the frontend.
 * The background agent system lets users push tasks to background execution
 * using the "&" prefix pattern (e.g., "& run the test suite").
 *
 * Covered commands (sys/commands/background_agents.rs):
 *   background_agent_push         — push a conversation to background (already used inline)
 *   background_agent_list         — all agents including completed last 24h
 *   background_agent_list_active  — only non-terminal agents [NEW]
 *   background_agent_get          — get single agent by ID [NEW]
 *   background_agent_pause        — pause a running agent [NEW]
 *   background_agent_resume       — resume a paused agent (was inline-only) [PROMOTED]
 *   background_agent_cancel       — cancel an agent [NEW]
 *   background_agent_take_over    — bring agent to foreground [NEW]
 *   background_agent_cleanup      — evict old completed agents [NEW]
 *   background_agent_stats        — aggregate counts [NEW]
 *   background_agent_should_push  — detect "&" prefix in goal text [NEW]
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';
import { toast } from 'sonner';

// =============================================================================
// Types (mirror Rust BackgroundAgent in core/agent/background_agent.rs)
// =============================================================================

export type BackgroundAgentStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BackgroundAgent {
  id: string;
  conversationId: string;
  goal: string;
  status: BackgroundAgentStatus;
  priority: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress: number;
  currentStep?: string;
  result?: string;
  error?: string;
  notificationSent: boolean;
}

export interface BackgroundAgentContext {
  workingDirectory?: string;
  environment: Record<string, string>;
  conversationSnapshot: ConversationMessage[];
  activeMcpServers: string[];
  customInstructions?: string;
}

export interface ConversationMessage {
  role: string;
  content: string;
  timestamp: string;
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

export interface PushToBackgroundInput {
  conversationId: string;
  goal: string;
  workingDirectory?: string;
  conversationHistory?: Array<{ role: string; content: string; timestamp?: string }>;
  activeMcpServers?: string[];
  customInstructions?: string;
  priority?: number;
  timeoutSecs?: number;
}

// =============================================================================
// Store State
// =============================================================================

interface BackgroundAgentStoreState {
  agents: BackgroundAgent[];
  activeAgents: BackgroundAgent[];
  stats: BackgroundAgentStats | null;
  isLoading: boolean;
  isTakingOver: boolean;
  takenOverAgent: TakeOverResponse | null;
  error: string | null;

  // Actions
  pushToBackground: (input: PushToBackgroundInput) => Promise<PushResponse | null>;
  listAgents: () => Promise<BackgroundAgent[]>;
  listActiveAgents: () => Promise<BackgroundAgent[]>;
  getAgent: (agentId: string) => Promise<BackgroundAgent | null>;
  pauseAgent: (agentId: string) => Promise<boolean>;
  resumeAgent: (agentId: string) => Promise<boolean>;
  cancelAgent: (agentId: string) => Promise<boolean>;
  takeOver: (agentId: string) => Promise<TakeOverResponse | null>;
  cleanup: () => Promise<number>;
  fetchStats: () => Promise<BackgroundAgentStats | null>;
  shouldPush: (goal: string) => Promise<{ shouldPush: boolean; cleanedGoal: string } | null>;
  clearError: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useBackgroundAgentStore = create<BackgroundAgentStoreState>()(
  devtools(
    immer((set) => ({
      agents: [],
      activeAgents: [],
      stats: null,
      isLoading: false,
      isTakingOver: false,
      takenOverAgent: null,
      error: null,

      pushToBackground: async (input) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'backgroundAgent/push/start',
        );
        try {
          const response = await invoke<PushResponse>('background_agent_push', { input });
          set(
            (state) => {
              state.isLoading = false;
            },
            undefined,
            'backgroundAgent/push/done',
          );
          if (response.started) {
            toast.success('Agent started in background');
          } else {
            toast.info(`Agent queued (position ${response.queuePosition ?? '?'})`);
          }
          return response;
        } catch (err) {
          const msg = String(err);
          set(
            (state) => {
              state.error = msg;
              state.isLoading = false;
            },
            undefined,
            'backgroundAgent/push/error',
          );
          toast.error(`Failed to push to background: ${msg}`);
          return null;
        }
      },

      listAgents: async () => {
        set(
          (state) => {
            state.isLoading = true;
          },
          undefined,
          'backgroundAgent/list/start',
        );
        try {
          const response = await invoke<ListAgentsResponse>('background_agent_list');
          set(
            (state) => {
              state.agents = response.agents;
              state.isLoading = false;
            },
            undefined,
            'backgroundAgent/list/done',
          );
          return response.agents;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'backgroundAgent/list/error',
          );
          return [];
        }
      },

      listActiveAgents: async () => {
        try {
          const agents = await invoke<BackgroundAgent[]>('background_agent_list_active');
          set(
            (state) => {
              state.activeAgents = agents;
            },
            undefined,
            'backgroundAgent/listActive/done',
          );
          return agents;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'backgroundAgent/listActive/error',
          );
          return [];
        }
      },

      getAgent: async (agentId) => {
        try {
          const agent = await invoke<BackgroundAgent | null>('background_agent_get', { agentId });
          if (agent) {
            set(
              (state) => {
                const idx = state.agents.findIndex((a) => a.id === agentId);
                if (idx !== -1) {
                  state.agents[idx] = agent;
                }
                const activeIdx = state.activeAgents.findIndex((a) => a.id === agentId);
                if (activeIdx !== -1) {
                  state.activeAgents[activeIdx] = agent;
                }
              },
              undefined,
              'backgroundAgent/get/done',
            );
          }
          return agent;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'backgroundAgent/get/error',
          );
          return null;
        }
      },

      pauseAgent: async (agentId) => {
        try {
          await invoke('background_agent_pause', { agentId });
          set(
            (state) => {
              const agent = state.agents.find((a) => a.id === agentId);
              if (agent) agent.status = 'paused';
              const active = state.activeAgents.find((a) => a.id === agentId);
              if (active) active.status = 'paused';
            },
            undefined,
            'backgroundAgent/pause/done',
          );
          toast.success('Agent paused');
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'backgroundAgent/pause/error',
          );
          toast.error(`Failed to pause agent: ${err}`);
          return false;
        }
      },

      resumeAgent: async (agentId) => {
        try {
          await invoke('background_agent_resume', { agentId });
          set(
            (state) => {
              const agent = state.agents.find((a) => a.id === agentId);
              if (agent) agent.status = 'running';
              const active = state.activeAgents.find((a) => a.id === agentId);
              if (active) active.status = 'running';
            },
            undefined,
            'backgroundAgent/resume/done',
          );
          toast.success('Agent resumed');
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'backgroundAgent/resume/error',
          );
          toast.error(`Failed to resume agent: ${err}`);
          return false;
        }
      },

      cancelAgent: async (agentId) => {
        try {
          await invoke('background_agent_cancel', { agentId });
          set(
            (state) => {
              const agent = state.agents.find((a) => a.id === agentId);
              if (agent) agent.status = 'cancelled';
              state.activeAgents = state.activeAgents.filter((a) => a.id !== agentId);
            },
            undefined,
            'backgroundAgent/cancel/done',
          );
          toast.info('Agent cancelled');
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'backgroundAgent/cancel/error',
          );
          toast.error(`Failed to cancel agent: ${err}`);
          return false;
        }
      },

      takeOver: async (agentId) => {
        set(
          (state) => {
            state.isTakingOver = true;
            state.error = null;
          },
          undefined,
          'backgroundAgent/takeOver/start',
        );
        try {
          const response = await invoke<TakeOverResponse>('background_agent_take_over', {
            agentId,
          });
          set(
            (state) => {
              state.takenOverAgent = response;
              state.isTakingOver = false;
              // Remove from active list since it's now foreground
              state.activeAgents = state.activeAgents.filter((a) => a.id !== agentId);
            },
            undefined,
            'backgroundAgent/takeOver/done',
          );
          toast.success(`Took over agent: ${response.agent.goal.slice(0, 60)}`);
          return response;
        } catch (err) {
          const msg = String(err);
          set(
            (state) => {
              state.error = msg;
              state.isTakingOver = false;
            },
            undefined,
            'backgroundAgent/takeOver/error',
          );
          toast.error(`Failed to take over agent: ${msg}`);
          return null;
        }
      },

      cleanup: async () => {
        try {
          const count = await invoke<number>('background_agent_cleanup');
          // Refresh the agent list
          set(
            (state) => {
              state.agents = state.agents.filter(
                (a) =>
                  a.status !== 'completed' && a.status !== 'failed' && a.status !== 'cancelled',
              );
            },
            undefined,
            'backgroundAgent/cleanup/done',
          );
          if (count > 0) {
            toast.info(`Cleaned up ${count} old agent(s)`);
          }
          return count;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'backgroundAgent/cleanup/error',
          );
          return 0;
        }
      },

      fetchStats: async () => {
        try {
          const stats = await invoke<BackgroundAgentStats>('background_agent_stats');
          set(
            (state) => {
              state.stats = stats;
            },
            undefined,
            'backgroundAgent/stats/done',
          );
          return stats;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'backgroundAgent/stats/error',
          );
          return null;
        }
      },

      shouldPush: async (goal) => {
        try {
          const [shouldPushResult, cleanedGoal] = await invoke<[boolean, string]>(
            'background_agent_should_push',
            { goal },
          );
          return { shouldPush: shouldPushResult, cleanedGoal };
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'backgroundAgent/shouldPush/error',
          );
          return null;
        }
      },

      clearError: () =>
        set(
          (state) => {
            state.error = null;
          },
          undefined,
          'backgroundAgent/clearError',
        ),
    })),
    { name: 'BackgroundAgentStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Event Listener Setup
// =============================================================================

let _listenerCleanup: (() => void) | null = null;

/** Subscribe to background agent status events from the Rust backend. */
export function subscribeToBackgroundAgentEvents(): () => void {
  if (_listenerCleanup) return _listenerCleanup;

  const unlisteners: Promise<UnlistenFn>[] = [];

  // Agent completed notification
  unlisteners.push(
    listen<{ agentId: string; goal: string; success: boolean; result?: string }>(
      'background_agent:completed',
      (event) => {
        const { agentId, goal, success, result } = event.payload;
        useBackgroundAgentStore.setState(
          (state) => {
            const agent = state.agents.find((a) => a.id === agentId);
            if (agent) {
              agent.status = success ? 'completed' : 'failed';
              if (result) agent.result = result;
            }
            state.activeAgents = state.activeAgents.filter((a) => a.id !== agentId);
          },
          undefined,
          'backgroundAgent/event/completed',
        );
        if (success) {
          toast.success(`Background agent finished: ${goal.slice(0, 60)}`);
        } else {
          toast.error(`Background agent failed: ${goal.slice(0, 60)}`);
        }
      },
    ),
  );

  // Agent progress update
  unlisteners.push(
    listen<{ agentId: string; progress: number; currentStep?: string }>(
      'background_agent:progress',
      (event) => {
        const { agentId, progress, currentStep } = event.payload;
        useBackgroundAgentStore.setState(
          (state) => {
            const agent = state.agents.find((a) => a.id === agentId);
            if (agent) {
              agent.progress = progress;
              if (currentStep) agent.currentStep = currentStep;
            }
            const active = state.activeAgents.find((a) => a.id === agentId);
            if (active) {
              active.progress = progress;
              if (currentStep) active.currentStep = currentStep;
            }
          },
          undefined,
          'backgroundAgent/event/progress',
        );
      },
    ),
  );

  // Agent status change
  unlisteners.push(
    listen<{ agentId: string; status: BackgroundAgentStatus }>(
      'background_agent:status_changed',
      (event) => {
        const { agentId, status } = event.payload;
        useBackgroundAgentStore.setState(
          (state) => {
            const agent = state.agents.find((a) => a.id === agentId);
            if (agent) agent.status = status;
            if (status === 'completed' || status === 'failed' || status === 'cancelled') {
              state.activeAgents = state.activeAgents.filter((a) => a.id !== agentId);
            }
          },
          undefined,
          'backgroundAgent/event/statusChanged',
        );
      },
    ),
  );

  const cleanup = () => {
    unlisteners.forEach((p) =>
      p
        .then((fn) => fn())
        .catch((err) => console.warn('[backgroundAgentStore] Unlisten failed:', err)),
    );
    _listenerCleanup = null;
  };

  _listenerCleanup = cleanup;
  return cleanup;
}

// =============================================================================
// Selectors
// =============================================================================

export const selectAllAgents = (state: BackgroundAgentStoreState) => state.agents;
export const selectActiveAgents = (state: BackgroundAgentStoreState) => state.activeAgents;
export const selectBackgroundAgentStats = (state: BackgroundAgentStoreState) => state.stats;
export const selectBackgroundAgentLoading = (state: BackgroundAgentStoreState) => state.isLoading;
export const selectIsTakingOver = (state: BackgroundAgentStoreState) => state.isTakingOver;
export const selectTakenOverAgent = (state: BackgroundAgentStoreState) => state.takenOverAgent;
export const selectBackgroundAgentError = (state: BackgroundAgentStoreState) => state.error;
export const selectRunningAgentsCount = (state: BackgroundAgentStoreState) =>
  state.agents.filter((a) => a.status === 'running').length;
export const selectIsAtCapacity = (state: BackgroundAgentStoreState) =>
  state.stats?.atCapacity ?? false;
