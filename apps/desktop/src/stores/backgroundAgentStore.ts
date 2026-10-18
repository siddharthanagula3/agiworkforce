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

export type BackgroundAgentBoundary = 'local' | 'on_device' | 'managed_cloud';

export interface BackgroundAgentContext {
  boundary?: BackgroundAgentBoundary | null;
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
  activeCount: number;
  maxAgents: number;
  isLoading: boolean;
  error: string | null;

  startAgent: (goal: string) => Promise<string>;
  listAgents: () => Promise<BackgroundAgent[]>;
  getAgent: (agentId: string) => Promise<BackgroundAgent | null>;
  pauseAgent: (agentId: string) => Promise<void>;
  resumeAgent: (agentId: string) => Promise<void>;
  cancelAgent: (agentId: string) => Promise<void>;

  clearError: () => void;
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
      activeCount: 0,
      maxAgents: DEFAULT_MAX_AGENTS,
      isLoading: false,
      error: null,

      startAgent: async (goal) => {
        const agentId = await invoke<string>('background_agent_start', { goal });
        await get().getAgent(agentId);
        return agentId;
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

      clearError: () => set({ error: null }, undefined, 'backgroundAgent/clearError'),
      reset: () =>
        set(
          {
            agents: [],
            activeCount: 0,
            maxAgents: DEFAULT_MAX_AGENTS,
            isLoading: false,
            error: null,
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
