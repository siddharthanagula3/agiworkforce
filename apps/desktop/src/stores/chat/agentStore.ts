import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isTauri, listen } from '../../lib/tauri-mock';

export interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  currentGoal?: string;
  currentStep?: string;
  progress: number;
  resourceUsage?: {
    cpu: number;
    memory: number;
  };
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface ActionTrailEntry {
  id: string;
  type: 'thinking' | 'searching' | 'coding' | 'running' | 'completed' | 'error';
  message: string;
  timestamp: Date;
  fadeAfter?: number;
  metadata?: Record<string, unknown>;
  progress?: number;
  currentStep?: number;
  totalSteps?: number;
}

export interface AgentState {
  agents: AgentStatus[];
  agentStatus: AgentStatus | null;

  actionTrail: ActionTrailEntry[];
  fadeTimers: Map<string, ReturnType<typeof setTimeout>>;

  isAutonomousMode: boolean;
  missionControlOpen: boolean;

  updateAgentStatus: (id: string, status: Partial<AgentStatus>) => void;
  setAgentStatus: (status: AgentStatus | null) => void;
  addAgent: (agent: AgentStatus) => void;
  removeAgent: (id: string) => void;

  addActionTrailEntry: (entry: Omit<ActionTrailEntry, 'id' | 'timestamp'>) => void;
  removeActionTrailEntry: (id: string) => void;
  clearActionTrail: () => void;
  getActiveActionTrail: (messageId?: string) => ActionTrailEntry[];

  setAutonomousMode: (value: boolean) => void;
  setMissionControlOpen: (open: boolean) => void;

  resetOnLogout: () => void;
}

export const useAgentStore = create<AgentState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        agents: [],
        agentStatus: null,
        actionTrail: [],
        fadeTimers: new Map(),
        isAutonomousMode: false,
        missionControlOpen: false,

        updateAgentStatus: (id, status) =>
          set(
            (state) => {
              const index = state.agents.findIndex((a) => a.id === id);
              if (index !== -1 && state.agents[index]) {
                Object.assign(state.agents[index]!, status);
              }
            },
            undefined,
            'agent/updateAgentStatus',
          ),

        setAgentStatus: (status) =>
          set(
            (state) => {
              state.agentStatus = status;
            },
            undefined,
            'agent/setAgentStatus',
          ),

        addAgent: (agent) =>
          set(
            (state) => {
              state.agents.push(agent);
            },
            undefined,
            'agent/addAgent',
          ),

        removeAgent: (id) =>
          set(
            (state) => {
              state.agents = state.agents.filter((a) => a.id !== id);
            },
            undefined,
            'agent/removeAgent',
          ),

        addActionTrailEntry: (entry) =>
          set(
            (state) => {
              const newEntry: ActionTrailEntry = {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                ...entry,
              };
              state.actionTrail.push(newEntry);

              if (state.actionTrail.length > 5000) {
                const entriesToRemove = state.actionTrail.slice(0, state.actionTrail.length - 5000);
                for (const oldEntry of entriesToRemove) {
                  const timerId = state.fadeTimers.get(oldEntry.id);
                  if (timerId !== undefined) {
                    clearTimeout(timerId);
                    state.fadeTimers.delete(oldEntry.id);
                  }
                }
                state.actionTrail = state.actionTrail.slice(-5000);
              }

              if (entry.fadeAfter) {
                const timerId = setTimeout(() => {
                  try {
                    get().removeActionTrailEntry(newEntry.id);
                  } catch (error) {
                    console.warn('[AgentStore] Error during auto-remove:', error);
                  }
                }, entry.fadeAfter);
                state.fadeTimers.set(newEntry.id, timerId);
              }
            },
            undefined,
            'agent/addActionTrailEntry',
          ),

        removeActionTrailEntry: (id) =>
          set(
            (state) => {
              const timerId = state.fadeTimers.get(id);
              if (timerId !== undefined) {
                clearTimeout(timerId);
                state.fadeTimers.delete(id);
              }
              state.actionTrail = state.actionTrail.filter((entry) => entry.id !== id);
            },
            undefined,
            'agent/removeActionTrailEntry',
          ),

        clearActionTrail: () =>
          set(
            (state) => {
              state.fadeTimers.forEach((timerId) => clearTimeout(timerId));
              state.fadeTimers.clear();
              state.actionTrail = [];
            },
            undefined,
            'agent/clearActionTrail',
          ),

        getActiveActionTrail: (messageId) => {
          const state = get();
          if (!messageId) {
            return state.actionTrail;
          }
          return state.actionTrail.filter((entry) => entry.metadata?.['messageId'] === messageId);
        },

        setAutonomousMode: (value) =>
          set(
            (state) => {
              state.isAutonomousMode = value;
            },
            undefined,
            'agent/setAutonomousMode',
          ),

        setMissionControlOpen: (open) =>
          set(
            (state) => {
              state.missionControlOpen = open;
            },
            undefined,
            'agent/setMissionControlOpen',
          ),

        resetOnLogout: () => {
          set(
            (state) => {
              state.fadeTimers.forEach((timerId) => clearTimeout(timerId));
              state.agents = [];
              state.agentStatus = null;
              state.actionTrail = [];
              state.fadeTimers = new Map();
              state.isAutonomousMode = false;
              state.missionControlOpen = false;
            },
            undefined,
            'agent/resetOnLogout',
          );
        },
      })),
    ),
    { name: 'AgentStore', enabled: import.meta.env.DEV },
  ),
);

export type AgentStatusPayload = Partial<AgentStatus> & {
  id: string;
  status?: AgentStatus['status'] | string;
  current_goal?: string;
  current_step?: string;
  started_at?: number | string | Date;
  completed_at?: number | string | Date;
  resource_usage?: { cpu: number; memory: number };
};

let agentStatusListenerInitialized = false;

export async function initializeAgentStatusListener() {
  if (agentStatusListenerInitialized || !isTauri) {
    return;
  }

  agentStatusListenerInitialized = true;

  try {
    await listen<AgentStatusPayload>('agent:status:update', (event) => {
      applyAgentStatusUpdate(event.payload);
    });
  } catch (error) {
    agentStatusListenerInitialized = false;
    console.error('[AgentStore] Failed to initialize agent status listener:', error);
  }
}

export function applyAgentStatusSnapshot(payloads: AgentStatusPayload[]) {
  useAgentStore.setState(
    (state) => {
      if (!payloads || payloads.length === 0) {
        state.agents = [];
        state.agentStatus = null;
        return;
      }

      const validPayloads = payloads.filter((p) => p.id);
      if (validPayloads.length === 0) {
        state.agents = [];
        state.agentStatus = null;
        return;
      }

      const normalized = validPayloads.map((agent) => mergeAgentStatus(undefined, agent));
      state.agents = normalized;
      state.agentStatus =
        normalized.find((agent) => agent.status === 'running' || agent.status === 'paused') ??
        normalized[0] ??
        null;
    },
    undefined,
    'agent/applyStatusSnapshot',
  );
}

function applyAgentStatusUpdate(payload: AgentStatusPayload) {
  if (!payload.id) {
    console.warn('[agentStore] applyAgentStatusUpdate called without id, skipping');
    return;
  }

  useAgentStore.setState(
    (state) => {
      const index = state.agents.findIndex((agent) => agent.id === payload.id);
      const nextStatus = mergeAgentStatus(index !== -1 ? state.agents[index] : undefined, payload);

      if (index !== -1) {
        state.agents[index] = nextStatus;
      } else {
        state.agents.push(nextStatus);
      }

      if (
        !state.agentStatus ||
        state.agentStatus.id === nextStatus.id ||
        nextStatus.status === 'running'
      ) {
        state.agentStatus = nextStatus;
      }
    },
    undefined,
    'agent/applyStatusUpdate',
  );
}

function mergeAgentStatus(
  previous: AgentStatus | undefined,
  payload: AgentStatusPayload,
): AgentStatus {
  return {
    id: payload.id,
    name: payload.name ?? previous?.name ?? 'Agent',
    status: normalizeStatus(payload.status, previous?.status ?? 'idle'),
    currentGoal: payload.currentGoal ?? payload.current_goal ?? previous?.currentGoal,
    currentStep: payload.currentStep ?? payload.current_step ?? previous?.currentStep,
    progress: normalizeProgress(payload.progress, previous?.progress ?? 0),
    resourceUsage: normalizeResourceUsage(
      payload.resourceUsage ?? payload.resource_usage,
      previous?.resourceUsage,
    ),
    startedAt: normalizeTimestamp(payload.startedAt ?? payload.started_at, previous?.startedAt),
    completedAt: normalizeTimestamp(
      payload.completedAt ?? payload.completed_at,
      previous?.completedAt,
    ),
    error: payload.error ?? previous?.error,
  };
}

const VALID_AGENT_STATUSES: AgentStatus['status'][] = [
  'idle',
  'running',
  'paused',
  'completed',
  'failed',
];

function normalizeStatus(
  value: unknown,
  fallback: AgentStatus['status'] = 'idle',
): AgentStatus['status'] {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.toLowerCase() as AgentStatus['status'];
  return VALID_AGENT_STATUSES.includes(normalized) ? normalized : fallback;
}

function normalizeProgress(value: unknown, fallback = 0): number {
  const raw =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : fallback;

  if (Number.isNaN(raw)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, raw));
}

function normalizeTimestamp(value: unknown, fallback?: Date): Date | undefined {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (value instanceof Date) {
    return value;
  }

  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);

  if (Number.isNaN(numeric)) {
    return fallback;
  }

  const milliseconds = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  return new Date(milliseconds);
}

function normalizeResourceUsage(
  value: unknown,
  fallback?: { cpu: number; memory: number },
): { cpu: number; memory: number } | undefined {
  if (
    value &&
    typeof value === 'object' &&
    'cpu' in value &&
    'memory' in value &&
    typeof (value as { cpu: unknown }).cpu === 'number' &&
    typeof (value as { memory: unknown }).memory === 'number'
  ) {
    const usage = value as { cpu: number; memory: number };
    return { cpu: usage.cpu, memory: usage.memory };
  }

  return fallback;
}
