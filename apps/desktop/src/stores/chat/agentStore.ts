/**
 * Agent Store
 *
 * Manages agent status, background tasks, and agent-related operations.
 * Split from unifiedChatStore for better modularity.
 *
 * Zustand v5 best practices:
 * - Middleware composition: devtools(subscribeWithSelector(immer(...)))
 * - Export selectors for all state slices
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, isTauri } from '../../lib/tauri-mock';

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

export type BackgroundTaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BackgroundTaskPriority = 'low' | 'normal' | 'high';

export interface BackgroundTask {
  id: string;
  name: string;
  description?: string;
  status: BackgroundTaskStatus;
  progress: number;
  priority: BackgroundTaskPriority;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

/** Number of milliseconds in 24 hours — used for stale background task eviction. */
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;

/** Maximum number of background tasks retained in the store. */
const BACKGROUND_TASKS_LIMIT = 100;

/**
 * Removes background tasks that completed or failed more than 24 hours ago.
 * Pure function — does not mutate the input array.
 */
function evictStaleBackgroundTasks(tasks: BackgroundTask[]): BackgroundTask[] {
  const cutoff = Date.now() - TWENTY_FOUR_HOURS_MS;
  return tasks.filter((t) => {
    if (t.status !== 'completed' && t.status !== 'failed') {
      return true;
    }
    const completedTime = t.completedAt?.getTime() ?? t.createdAt.getTime();
    return completedTime > cutoff;
  });
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
  // Agent status
  agents: AgentStatus[];
  agentStatus: AgentStatus | null;

  // Background tasks
  backgroundTasks: BackgroundTask[];

  // Action trail
  actionTrail: ActionTrailEntry[];
  fadeTimers: Map<string, ReturnType<typeof setTimeout>>;

  // Autonomous mode
  isAutonomousMode: boolean;
  missionControlOpen: boolean;

  // Actions - Agent status
  updateAgentStatus: (id: string, status: Partial<AgentStatus>) => void;
  setAgentStatus: (status: AgentStatus | null) => void;
  addAgent: (agent: AgentStatus) => void;
  removeAgent: (id: string) => void;

  // Actions - Background tasks
  updateTaskProgress: (id: string, progress: number) => void;
  addBackgroundTask: (task: Omit<BackgroundTask, 'createdAt'>) => void;
  updateBackgroundTask: (id: string, updates: Partial<BackgroundTask>) => void;
  clearBackgroundTasks: () => void;

  // Actions - Action trail
  addActionTrailEntry: (entry: Omit<ActionTrailEntry, 'id' | 'timestamp'>) => void;
  removeActionTrailEntry: (id: string) => void;
  clearActionTrail: () => void;
  getActiveActionTrail: (messageId?: string) => ActionTrailEntry[];

  // Actions - Autonomous mode
  setAutonomousMode: (value: boolean) => void;
  setMissionControlOpen: (open: boolean) => void;

  // Actions - Reset
  resetOnLogout: () => void;
}

export const useAgentStore = create<AgentState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        // Initial state
        agents: [],
        agentStatus: null,
        backgroundTasks: [],
        actionTrail: [],
        fadeTimers: new Map(),
        isAutonomousMode: false,
        missionControlOpen: false,

        // Agent status actions
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

        // Background task actions
        updateTaskProgress: (id, progress) =>
          set(
            (state) => {
              const index = state.backgroundTasks.findIndex((t) => t.id === id);
              if (index !== -1 && state.backgroundTasks[index]) {
                state.backgroundTasks[index]!.progress = progress;
              }
            },
            undefined,
            'agent/updateTaskProgress',
          ),

        addBackgroundTask: (task) =>
          set(
            (state) => {
              if (state.backgroundTasks.some((t) => t.id === task.id)) {
                return;
              }
              state.backgroundTasks.push({ ...task, createdAt: new Date() });
              // Evict stale completed/failed tasks, then cap total count
              state.backgroundTasks = evictStaleBackgroundTasks(state.backgroundTasks);
              if (state.backgroundTasks.length > BACKGROUND_TASKS_LIMIT) {
                state.backgroundTasks = state.backgroundTasks.slice(-BACKGROUND_TASKS_LIMIT);
              }
            },
            undefined,
            'agent/addBackgroundTask',
          ),

        updateBackgroundTask: (id, updates) =>
          set(
            (state) => {
              const index = state.backgroundTasks.findIndex((t) => t.id === id);
              if (index !== -1 && state.backgroundTasks[index]) {
                Object.assign(state.backgroundTasks[index]!, updates);
              }
            },
            undefined,
            'agent/updateBackgroundTask',
          ),

        clearBackgroundTasks: () =>
          set(
            (state) => {
              state.backgroundTasks = [];
            },
            undefined,
            'agent/clearBackgroundTasks',
          ),

        // Action trail actions
        addActionTrailEntry: (entry) =>
          set(
            (state) => {
              const newEntry: ActionTrailEntry = {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                ...entry,
              };
              state.actionTrail.push(newEntry);

              // STR-004 fix: Cap actionTrail at 5000 entries to prevent unbounded growth
              if (state.actionTrail.length > 5000) {
                // Get IDs of entries being removed to clean up their timers
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

        // Autonomous mode actions
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

        // Reset
        resetOnLogout: () => {
          set(
            (state) => {
              // Clear timers inside the set() callback to avoid a race where a concurrent
              // addActionTrailEntry() call adds a new timer between the get() read and the
              // set() commit, which would leak the timer.
              state.fadeTimers.forEach((timerId) => clearTimeout(timerId));
              state.agents = [];
              state.agentStatus = null;
              state.backgroundTasks = [];
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

// Selectors
export const selectAgents = (state: AgentState) => state.agents;
export const selectAgentStatus = (state: AgentState) => state.agentStatus;
export const selectBackgroundTasks = (state: AgentState) => state.backgroundTasks;
export const selectActionTrail = (state: AgentState) => state.actionTrail;
export const selectIsAutonomousMode = (state: AgentState) => state.isAutonomousMode;
export const selectMissionControlOpen = (state: AgentState) => state.missionControlOpen;

// Derived selectors
export const selectRunningAgents = (state: AgentState) =>
  state.agents.filter((a) => a.status === 'running');

export const selectActiveBackgroundTasks = (state: AgentState) =>
  state.backgroundTasks.filter((t) => t.status === 'running' || t.status === 'queued');

// Agent status listener types and helpers
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
    await bootstrapAgentStatuses();
    const { listen } = await import('@tauri-apps/api/event');
    await listen<AgentStatusPayload>('agent:status:update', (event) => {
      applyAgentStatusUpdate(event.payload);
    });
  } catch (error) {
    agentStatusListenerInitialized = false;
    console.error('[AgentStore] Failed to initialize agent status listener:', error);
  }
}

async function bootstrapAgentStatuses() {
  try {
    const agents = await invoke<AgentStatusPayload[]>('refresh_agent_status');
    applyAgentStatusSnapshot(Array.isArray(agents) ? agents : []);
  } catch {
    applyAgentStatusSnapshot([]);
    console.debug(
      '[AgentStore] Agent status bootstrap returned empty (orchestrator not yet initialized)',
    );
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

      // Defensive: filter out payloads without id
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
  // Defensive: skip if no id provided
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
