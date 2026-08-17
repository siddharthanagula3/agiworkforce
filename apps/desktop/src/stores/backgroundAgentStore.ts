import { toast } from 'sonner';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';

export const BACKGROUND_AGENT_STATUSES = [
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'taken_over',
] as const;

export type BackgroundAgentStatus = (typeof BACKGROUND_AGENT_STATUSES)[number];

const TERMINAL_STATUSES: readonly BackgroundAgentStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'taken_over',
];

export function isTerminalBackgroundAgentStatus(status: BackgroundAgentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface BackgroundAgentProgress {
  currentStep: number;
  totalSteps: number;
  currentStepDescription: string;
  percentage: number;
  elapsedSecs: number;
}

export interface BackgroundAgentSummary {
  description: string;
  filesChanged: string[];
  actionsTaken: string[];
  warnings: string[];
  goalAchieved: boolean;
}

export interface BackgroundAgentConversationMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface BackgroundAgentContext {
  workingDirectory: string | null;
  environment: Record<string, string>;
  conversationSnapshot: BackgroundAgentConversationMessage[];
  activeMcpServers: string[];
  customInstructions: string | null;
}

export interface BackgroundAgent {
  id: string;
  conversationId: string;
  goal: string;
  status: BackgroundAgentStatus;
  progress: BackgroundAgentProgress;
  summary: BackgroundAgentSummary | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  context: BackgroundAgentContext;
  priority: number;
  timeoutSecs: number;
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

export interface PushBackgroundAgentInput {
  conversationId: string;
  goal: string;
  workingDirectory?: string;
  conversationHistory?: BackgroundAgentConversationMessage[];
  activeMcpServers?: string[];
  customInstructions?: string;
  priority?: number;
  timeoutSecs?: number;
}

export interface PushBackgroundAgentResponse {
  agentId: string;
  queuePosition: number | null;
  started: boolean;
}

export interface BackgroundAgentTakeOver {
  agent: BackgroundAgent;
  context: BackgroundAgentContext;
}

interface ListAgentsResponse {
  agents: BackgroundAgent[];
  activeCount: number;
  maxAgents: number;
}

export interface BackgroundAgentEventPayload {
  agentId: string;
  message?: string | null;
}

interface BackgroundAgentState {
  agents: BackgroundAgent[];
  stats: BackgroundAgentStats | null;
  activeCount: number;
  maxAgents: number;
  isLoading: boolean;
  error: string | null;
  lastTakeOver: BackgroundAgentTakeOver | null;

  pushToBackground: (input: PushBackgroundAgentInput) => Promise<PushBackgroundAgentResponse>;
  listAgents: () => Promise<BackgroundAgent[]>;
  listActiveAgents: () => Promise<BackgroundAgent[]>;
  getAgent: (agentId: string) => Promise<BackgroundAgent | null>;
  pauseAgent: (agentId: string) => Promise<void>;
  resumeAgent: (agentId: string) => Promise<void>;
  cancelAgent: (agentId: string) => Promise<void>;
  takeOverAgent: (agentId: string) => Promise<BackgroundAgentTakeOver>;
  fetchStats: () => Promise<BackgroundAgentStats>;
  cleanupAgents: () => Promise<number>;
  shouldPushToBackground: (goal: string) => Promise<{ shouldPush: boolean; goal: string }>;

  clearError: () => void;
  clearTakeOver: () => void;
  reset: () => void;
}

const DEFAULT_MAX_AGENTS = 8;

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function upsertAgent(agents: BackgroundAgent[], agent: BackgroundAgent): BackgroundAgent[] {
  const index = agents.findIndex((entry) => entry.id === agent.id);
  if (index === -1) return [agent, ...agents];
  const next = [...agents];
  next[index] = agent;
  return next;
}

function countActive(agents: BackgroundAgent[]): number {
  return agents.filter((agent) => !isTerminalBackgroundAgentStatus(agent.status)).length;
}

export const useBackgroundAgentStore = create<BackgroundAgentState>()(
  devtools(
    (set, get) => ({
      agents: [],
      stats: null,
      activeCount: 0,
      maxAgents: DEFAULT_MAX_AGENTS,
      isLoading: false,
      error: null,
      lastTakeOver: null,

      pushToBackground: async (input) => {
        set({ isLoading: true, error: null }, undefined, 'backgroundAgent/push/start');
        try {
          const response = await invoke<PushBackgroundAgentResponse>('background_agent_push', {
            input,
          });
          await get().listAgents();
          set({ isLoading: false }, undefined, 'backgroundAgent/push/success');
          return response;
        } catch (error) {
          const message = toMessage(error);
          set({ error: message, isLoading: false }, undefined, 'backgroundAgent/push/error');
          toast.error(`Failed to start background agent: ${message}`);
          throw error;
        }
      },

      listAgents: async () => {
        set({ isLoading: true, error: null }, undefined, 'backgroundAgent/list/start');
        try {
          const response = await invoke<ListAgentsResponse>('background_agent_list');
          set(
            {
              agents: response.agents ?? [],
              activeCount: response.activeCount ?? 0,
              maxAgents: response.maxAgents ?? DEFAULT_MAX_AGENTS,
              isLoading: false,
            },
            undefined,
            'backgroundAgent/list/success',
          );
          return response.agents ?? [];
        } catch (error) {
          const message = toMessage(error);
          set({ error: message, isLoading: false }, undefined, 'backgroundAgent/list/error');
          return [];
        }
      },

      listActiveAgents: async () => {
        try {
          return await invoke<BackgroundAgent[]>('background_agent_list_active');
        } catch (error) {
          const message = toMessage(error);
          set({ error: message }, undefined, 'backgroundAgent/listActive/error');
          return [];
        }
      },

      getAgent: async (agentId) => {
        try {
          const agent = await invoke<BackgroundAgent | null>('background_agent_get', { agentId });
          if (agent) {
            set(
              (state) => {
                const agents = upsertAgent(state.agents, agent);
                return { agents, activeCount: countActive(agents) };
              },
              undefined,
              'backgroundAgent/get/success',
            );
          }
          return agent;
        } catch (error) {
          const message = toMessage(error);
          set({ error: message }, undefined, 'backgroundAgent/get/error');
          return null;
        }
      },

      pauseAgent: async (agentId) => {
        try {
          await invoke<void>('background_agent_pause', { agentId });
          applyBackgroundAgentStatus(agentId, 'paused');
        } catch (error) {
          const message = toMessage(error);
          set({ error: message }, undefined, 'backgroundAgent/pause/error');
          toast.error(`Failed to pause agent: ${message}`);
          throw error;
        }
      },

      resumeAgent: async (agentId) => {
        try {
          await invoke<void>('background_agent_resume', { agentId });
          applyBackgroundAgentStatus(agentId, 'running');
        } catch (error) {
          const message = toMessage(error);
          set({ error: message }, undefined, 'backgroundAgent/resume/error');
          toast.error(`Failed to resume agent: ${message}`);
          throw error;
        }
      },

      cancelAgent: async (agentId) => {
        try {
          await invoke<void>('background_agent_cancel', { agentId });
          applyBackgroundAgentStatus(agentId, 'cancelled');
        } catch (error) {
          const message = toMessage(error);
          set({ error: message }, undefined, 'backgroundAgent/cancel/error');
          toast.error(`Failed to cancel agent: ${message}`);
          throw error;
        }
      },

      takeOverAgent: async (agentId) => {
        try {
          const result = await invoke<BackgroundAgentTakeOver>('background_agent_take_over', {
            agentId,
          });
          set(
            (state) => {
              const agents = upsertAgent(state.agents, result.agent);
              return { agents, activeCount: countActive(agents), lastTakeOver: result };
            },
            undefined,
            'backgroundAgent/takeOver/success',
          );
          return result;
        } catch (error) {
          const message = toMessage(error);
          set({ error: message }, undefined, 'backgroundAgent/takeOver/error');
          toast.error(`Failed to take over agent: ${message}`);
          throw error;
        }
      },

      fetchStats: async () => {
        const stats = await invoke<BackgroundAgentStats>('background_agent_stats');
        set({ stats, maxAgents: stats.maxAgents }, undefined, 'backgroundAgent/stats/success');
        return stats;
      },

      cleanupAgents: async () => {
        const removed = await invoke<number>('background_agent_cleanup');
        if (removed > 0) {
          await get().listAgents();
        }
        return removed;
      },

      shouldPushToBackground: async (goal) => {
        const [shouldPush, cleanedGoal] = await invoke<[boolean, string]>(
          'background_agent_should_push',
          { goal },
        );
        return { shouldPush, goal: cleanedGoal };
      },

      clearError: () => set({ error: null }, undefined, 'backgroundAgent/clearError'),
      clearTakeOver: () => set({ lastTakeOver: null }, undefined, 'backgroundAgent/clearTakeOver'),
      reset: () =>
        set(
          {
            agents: [],
            stats: null,
            activeCount: 0,
            maxAgents: DEFAULT_MAX_AGENTS,
            isLoading: false,
            error: null,
            lastTakeOver: null,
          },
          undefined,
          'backgroundAgent/reset',
        ),
    }),
    { name: 'BackgroundAgentStore', enabled: import.meta.env.DEV },
  ),
);

export function applyBackgroundAgentStatus(
  agentId: string,
  status: BackgroundAgentStatus,
  error?: string | null,
): void {
  if (!agentId) return;
  useBackgroundAgentStore.setState((state) => {
    const index = state.agents.findIndex((agent) => agent.id === agentId);
    if (index === -1) return state;
    const agents = [...state.agents];
    const current = agents[index];
    if (!current) return state;
    agents[index] = {
      ...current,
      status,
      error: error ?? current.error,
      completedAt: isTerminalBackgroundAgentStatus(status)
        ? (current.completedAt ?? new Date().toISOString())
        : current.completedAt,
      startedAt:
        status === 'running' ? (current.startedAt ?? new Date().toISOString()) : current.startedAt,
    };
    return { ...state, agents, activeCount: countActive(agents) };
  });
}

const STATUS_EVENTS: Record<string, BackgroundAgentStatus> = {
  'background_agent:started': 'running',
  'background_agent:paused': 'paused',
  'background_agent:resumed': 'running',
  'background_agent:cancelled': 'cancelled',
  'background_agent:completed': 'completed',
  'background_agent:failed': 'failed',
  'background_agent:taken_over': 'taken_over',
};

export const BACKGROUND_AGENT_EVENTS = [
  'background_agent:created',
  'background_agent:progress',
  ...Object.keys(STATUS_EVENTS),
] as const;

export function applyBackgroundAgentEvent(
  event: string,
  payload: BackgroundAgentEventPayload,
): void {
  if (!payload?.agentId) return;

  const status = STATUS_EVENTS[event];
  if (status) {
    applyBackgroundAgentStatus(
      payload.agentId,
      status,
      status === 'failed' ? (payload.message ?? null) : undefined,
    );
  }

  const needsRefresh =
    event === 'background_agent:created' ||
    event === 'background_agent:progress' ||
    Boolean(status);
  if (needsRefresh) {
    void useBackgroundAgentStore.getState().getAgent(payload.agentId);
  }
}

let backgroundAgentUnlisteners: UnlistenFn[] = [];

export async function subscribeToBackgroundAgents(): Promise<() => void> {
  if (backgroundAgentUnlisteners.length > 0) {
    return unsubscribeFromBackgroundAgents;
  }

  for (const event of BACKGROUND_AGENT_EVENTS) {
    backgroundAgentUnlisteners.push(
      await listen<BackgroundAgentEventPayload>(event, ({ payload }) => {
        applyBackgroundAgentEvent(event, payload);
      }),
    );
  }

  return unsubscribeFromBackgroundAgents;
}

export function unsubscribeFromBackgroundAgents(): void {
  for (const unlisten of backgroundAgentUnlisteners) {
    try {
      unlisten();
    } catch (error) {
      console.error('[backgroundAgentStore] failed to unlisten:', toMessage(error));
    }
  }
  backgroundAgentUnlisteners = [];
}

export const selectBackgroundAgents = (state: BackgroundAgentState) => state.agents;
export const selectActiveBackgroundAgents = (state: BackgroundAgentState) =>
  state.agents.filter((agent) => !isTerminalBackgroundAgentStatus(agent.status));
export const selectBackgroundAgentError = (state: BackgroundAgentState) => state.error;
