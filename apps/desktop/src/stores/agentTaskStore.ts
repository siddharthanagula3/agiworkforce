// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { invoke, isTauri, listen } from '../lib/tauri-mock';
import { ensureAgiInitialized } from '../api/agi';
import { useAppModeStore, selectPrivacyMode } from './appModeStore';
import type {
  AgentTaskState as CanonicalAgentTaskState,
  AgentTaskStateChanged,
} from '@agiworkforce/types/protocol';
import type { PrivacyMode } from '@agiworkforce/types';

const MAX_LIVE_TASK_ENTRIES = 100;

/**
 * TRUST BOUNDARY (desktop-trust-boundary-01): every goal submission carries
 * the active workspace's execution boundary so the Rust AGI subsystem routes
 * LLM calls inside it. Mirrors `selectPrivacyMode` (`local`/`managed`);
 * BYOK is a per-conversation fork in chat, never an ambient agent-task mode.
 */
const activeTrustMode = (): PrivacyMode => selectPrivacyMode(useAppModeStore.getState());

export interface GoalSubmissionAuthority {
  /**
   * Re-checks caller-owned authority at the final native side-effect boundary.
   * Mobile Companion uses this to prevent an authenticated request from an
   * expired session launching work after AGI initialization completes.
   */
  assertCurrent?: () => void;
}

function captureGoalSubmissionAuthority(authority?: GoalSubmissionAuthority) {
  const trustMode = activeTrustMode();
  return {
    trustMode,
    assertCurrent() {
      authority?.assertCurrent?.();
      if (activeTrustMode() !== trustMode) {
        throw new DOMException(
          'The execution boundary changed before goal submission.',
          'AbortError',
        );
      }
    },
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Engine-authored lifecycle shared by every AGI surface. */
export type AgentTaskStatus = CanonicalAgentTaskState;

export interface AgentTask {
  id: string;
  goal: string;
  status: AgentTaskStatus;
  createdAt: string;
  completedAt?: string;
  iterations?: number;
  result?: string;
  insights?: string[];
  error?: string;
  /** Execution mode used: sequential, parallel, swarm, or auto */
  executionMode?: 'sequential' | 'parallel' | 'swarm' | 'auto';
  /** Swarm execution metrics (only set for swarm tasks) */
  swarmMetrics?: SwarmMetrics;
  /** Reason the engine paused the task. */
  pauseReason?: string;
}

export interface AgentTaskLiveStep {
  id: string;
  index: number;
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  executionTimeMs?: number;
  error?: string;
  output?: string;
}

export interface AgentTaskLiveProgress {
  step: number;
  total: number;
}

export interface SwarmMetrics {
  succeeded: number;
  failed: number;
  wallTimeMs: number;
  speedupRatio: number;
  criticalPathLength: number;
  maxParallelism: number;
  summary: string;
}

interface AgentTaskStoreState {
  tasks: AgentTask[];
  loading: boolean;
  liveStepsByTask: Record<string, AgentTaskLiveStep[]>;
  liveProgressByTask: Record<string, AgentTaskLiveProgress>;
  submitGoal: (
    goal: string,
    options?: { maxIterations?: number; parallel?: boolean } & GoalSubmissionAuthority,
  ) => Promise<string>;
  submitGoalSwarm: (
    goal: string,
    options?: {
      priority?: string;
      deadline?: number;
      successCriteria?: string[];
    } & GoalSubmissionAuthority,
  ) => Promise<string>;
  submitGoalAuto: (
    goal: string,
    options?: {
      priority?: string;
      deadline?: number;
      successCriteria?: string[];
    } & GoalSubmissionAuthority,
  ) => Promise<string>;
  shouldUseSwarm: (description: string) => Promise<boolean>;
  fetchTasks: () => Promise<void>;
  getTaskStatus: (taskId: string) => Promise<AgentTask | null>;
  cancelTask: (taskId: string) => Promise<void>;
  fetchInsights: (taskId: string) => Promise<string[]>;
  /** Pause a running task */
  pauseTask: (taskId: string, reason?: string) => Promise<void>;
  /** Resume a paused task */
  resumeTask: (taskId: string) => Promise<void>;
  /** Get a human-readable label for the current task status */
  getStatusLabel: (status: AgentTaskStatus) => string;
  /** Clear task state for logout and same-renderer account changes */
  resetOnLogout: () => void;
}

interface GoalFromBackend {
  id: string;
  description: string;
  priority: string;
  deadline?: number;
  constraints: string[];
  successCriteria: string[];
}

interface SubmitGoalResponse {
  goalId: string;
}

interface SubmitParallelGoalResponse {
  goalId: string;
  bestResult: {
    score: number;
    result: {
      success: boolean;
      error?: string | null;
    };
  };
}

interface GoalStatusResponse {
  context: { toolResults: Array<{ result?: unknown; error?: string | null }> };
  state: AgentTaskStatus;
  currentIteration: number;
}

interface ReflectionInsightResponse {
  recommendations: string[];
}

interface SwarmGoalResponse {
  success: boolean;
  goalId: string;
  succeeded: number;
  failed: number;
  wallTimeMs: number;
  speedupRatio: number;
  criticalPathLength: number;
  maxParallelism: number;
  summary: string;
}

export interface AgiGoalSubmittedPayload {
  goal_id: string;
  description: string;
}

export interface AgiGoalPlanCreatedPayload {
  goal_id: string;
  total_steps: number;
  estimated_duration_ms: number;
}

export interface AgiGoalStepStartedPayload {
  goal_id: string;
  step_id: string;
  step_index: number;
  total_steps: number;
  description: string;
}

export interface AgiGoalStepCompletedPayload {
  goal_id: string;
  step_id: string;
  step_index: number;
  total_steps: number;
  success: boolean;
  execution_time_ms: number;
  error?: string;
}

export interface AgiGoalProgressPayload {
  goal_id: string;
  completed_steps: number;
  total_steps: number;
  progress_percent: number;
}

export interface AgiGoalAchievedPayload {
  goal_id: string;
  total_steps: number;
  completed_steps: number;
}

export interface AgiGoalErrorPayload {
  goal_id: string;
  error: string;
}

export interface AgiGoalExecutionStartedPayload {
  goal_id: string;
  description: string;
}

export interface AgiGoalExecutionCompletedPayload {
  goal_id: string;
  success: boolean;
  error?: string;
}

export const useAgentTaskStore = create<AgentTaskStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        tasks: [],
        loading: false,
        liveStepsByTask: {},
        liveProgressByTask: {},

        submitGoal: async (goal, options = {}) => {
          try {
            const authority = captureGoalSubmissionAuthority(options);
            await ensureAgiInitialized();
            authority.assertCurrent();
            if (options.parallel) {
              const result = await invoke<SubmitParallelGoalResponse>('agi_submit_goal_parallel', {
                request: {
                  description: goal,
                  priority: 'medium',
                  numAgents: options.maxIterations ?? 4,
                  trustMode: authority.trustMode,
                },
              });
              const taskId = result.goalId;
              set((state) => ({
                tasks: upsertSubmittedAgentTask(state.tasks, {
                  id: taskId,
                  goal,
                  status: 'queued',
                  createdAt: new Date().toISOString(),
                  result: `Parallel execution returned a best score of ${result.bestResult.score}.`,
                  error: result.bestResult.result.error ?? undefined,
                  executionMode: 'parallel',
                }),
              }));
              return taskId;
            }

            const result = await invoke<SubmitGoalResponse>('agi_submit_goal', {
              request: {
                description: goal,
                priority: 'medium',
                trustMode: authority.trustMode,
              },
            });

            const taskId = result.goalId;

            set((state) => ({
              tasks: upsertSubmittedAgentTask(state.tasks, {
                id: taskId,
                goal,
                status: 'queued',
                createdAt: new Date().toISOString(),
                executionMode: 'sequential',
              }),
            }));

            return taskId;
          } catch (error) {
            if (!isAbortError(error)) {
              toast.error(
                `Failed to submit goal: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            }
            throw error;
          }
        },

        submitGoalSwarm: async (goal, options = {}) => {
          try {
            const authority = captureGoalSubmissionAuthority(options);
            await ensureAgiInitialized();
            authority.assertCurrent();
            const result = await invoke<SwarmGoalResponse>('agi_submit_goal_swarm', {
              request: {
                description: goal,
                priority: options.priority ?? 'medium',
                deadline: options.deadline,
                successCriteria: options.successCriteria,
                trustMode: authority.trustMode,
              },
            });

            const taskId = result.goalId;
            set((state) => ({
              tasks: upsertSubmittedAgentTask(state.tasks, {
                id: taskId,
                goal,
                status: 'queued',
                createdAt: new Date().toISOString(),
                result: result.summary,
                executionMode: 'swarm',
                swarmMetrics: {
                  succeeded: result.succeeded,
                  failed: result.failed,
                  wallTimeMs: result.wallTimeMs,
                  speedupRatio: result.speedupRatio,
                  criticalPathLength: result.criticalPathLength,
                  maxParallelism: result.maxParallelism,
                  summary: result.summary,
                },
              }),
            }));
            return taskId;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!isAbortError(err)) toast.error('Swarm execution failed: ' + msg);
            throw err;
          }
        },

        submitGoalAuto: async (goal, options = {}) => {
          try {
            const authority = captureGoalSubmissionAuthority(options);
            await ensureAgiInitialized();
            authority.assertCurrent();
            const result = await invoke<SubmitGoalResponse>('agi_submit_goal_auto', {
              request: {
                description: goal,
                priority: options.priority ?? 'medium',
                deadline: options.deadline,
                successCriteria: options.successCriteria,
                trustMode: authority.trustMode,
              },
            });

            const taskId = result.goalId;
            set((state) => ({
              tasks: upsertSubmittedAgentTask(state.tasks, {
                id: taskId,
                goal,
                status: 'queued',
                createdAt: new Date().toISOString(),
                executionMode: 'auto',
              }),
            }));
            return taskId;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!isAbortError(err)) toast.error('Auto goal submission failed: ' + msg);
            throw err;
          }
        },

        shouldUseSwarm: async (description) => {
          try {
            return await invoke<boolean>('agi_should_use_swarm', { description });
          } catch {
            return false;
          }
        },

        fetchTasks: async () => {
          set({ loading: true });
          try {
            const goals = await invoke<GoalFromBackend[]>('agi_list_goals');
            const existingTasks = get().tasks;

            const updatedTasks = goals.map((g) => {
              const existing = existingTasks.find((t) => t.id === g.id);
              return {
                id: g.id,
                goal: g.description,
                status: existing?.status ?? 'queued',
                createdAt: existing?.createdAt ?? new Date().toISOString(),
                completedAt: existing?.completedAt,
                iterations: existing?.iterations,
                result: existing?.result,
                insights: existing?.insights,
                error: existing?.error,
              };
            });

            // Keep local tasks that aren't in backend (e.g. parallel tasks)
            const backendIds = new Set(goals.map((g) => g.id));
            const localOnly = existingTasks.filter((t) => !backendIds.has(t.id));

            set({ tasks: [...updatedTasks, ...localOnly], loading: false });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[AgentTaskStore] Failed to fetch tasks:', err);
            toast.error('Failed to load agent tasks: ' + msg);
            set({ loading: false });
          }
        },

        getTaskStatus: async (taskId) => {
          try {
            const response = await invoke<GoalStatusResponse>('agi_get_goal_status', {
              goalId: taskId,
            });

            const mappedStatus = response.state;
            const lastResult = response.context.toolResults.at(-1);

            set((state) => ({
              tasks: state.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: mappedStatus,
                      iterations: response.currentIteration,
                      result:
                        lastResult?.result === undefined
                          ? t.result
                          : typeof lastResult.result === 'string'
                            ? lastResult.result
                            : JSON.stringify(lastResult.result),
                      error: lastResult?.error ?? t.error,
                      completedAt:
                        isTerminalAgentTaskStatus(mappedStatus) ||
                        mappedStatus === 'ready_for_review'
                          ? (t.completedAt ?? new Date().toISOString())
                          : undefined,
                    }
                  : t,
              ),
            }));

            return get().tasks.find((t) => t.id === taskId) ?? null;
          } catch {
            return null;
          }
        },

        cancelTask: async (taskId) => {
          try {
            await invoke('agi_cancel_goal', { goalId: taskId });
            await get().getTaskStatus(taskId);
          } catch (error) {
            toast.error('Failed to cancel task');
            console.error('[AgentTaskStore] cancelTask error:', error);
          }
        },

        fetchInsights: async (taskId) => {
          try {
            const response = await invoke<ReflectionInsightResponse | null>(
              'agi_get_reflection_insights',
              { goalId: taskId },
            );
            if (response?.recommendations) {
              set((state) => ({
                tasks: state.tasks.map((t) =>
                  t.id === taskId ? { ...t, insights: response.recommendations } : t,
                ),
              }));
              return response.recommendations;
            }
            return [];
          } catch {
            return [];
          }
        },

        pauseTask: async (taskId, reason) => {
          try {
            await invoke('agi_pause_goal', { goalId: taskId });
            await get().getTaskStatus(taskId);
            if (reason) {
              set((state) => ({
                tasks: state.tasks.map((task) =>
                  task.id === taskId ? { ...task, pauseReason: reason } : task,
                ),
              }));
            }
            toast.info('Agent task paused');
          } catch (error) {
            toast.error('Failed to pause agent task');
            console.error('[AgentTaskStore] pauseTask error:', error);
          }
        },

        resumeTask: async (taskId) => {
          try {
            await invoke('agi_resume_goal', { goalId: taskId });
            await get().getTaskStatus(taskId);
            toast.info('Agent task resumed');
          } catch (error) {
            toast.error('Failed to resume agent task');
            console.error('[AgentTaskStore] resumeTask error:', error);
          }
        },

        getStatusLabel: (status) => {
          const labels: Record<AgentTaskStatus, string> = {
            queued: 'Queued',
            running: 'Running',
            awaiting_input: 'Awaiting input',
            ready_for_review: 'Ready for review',
            completed: 'Completed',
            failed: 'Failed',
            cancelled: 'Cancelled',
            paused: 'Paused',
            archived: 'Archived',
          };
          return labels[status] ?? 'Unknown';
        },

        resetOnLogout: () => {
          set({
            tasks: [],
            loading: false,
            liveStepsByTask: {},
            liveProgressByTask: {},
          });
        },
      }),
      {
        name: 'agiworkforce-agent-tasks',
        partialize: (state) => ({
          tasks: state.tasks.slice(-500), // Cap at 500 most recent tasks to prevent unbounded localStorage growth
        }),
      },
    ),
    { name: 'AgentTaskStore' },
  ),
);

function upsertSubmittedAgentTask(tasks: AgentTask[], submitted: AgentTask): AgentTask[] {
  const existingIndex = tasks.findIndex((task) => task.id === submitted.id);
  if (existingIndex === -1) {
    return [...tasks, submitted];
  }

  const existing = tasks[existingIndex]!;
  const nextTasks = [...tasks];
  nextTasks[existingIndex] = {
    ...submitted,
    ...existing,
    goal: existing.goal || submitted.goal,
    executionMode: existing.executionMode ?? submitted.executionMode,
  };
  return nextTasks;
}

function upsertLiveStep(
  steps: AgentTaskLiveStep[],
  nextStep: AgentTaskLiveStep,
): AgentTaskLiveStep[] {
  const existingIndex = steps.findIndex((step) => step.id === nextStep.id);
  if (existingIndex === -1) {
    return [...steps, nextStep].sort((left, right) => left.index - right.index);
  }

  const existingStep = steps[existingIndex]!;
  const updatedSteps = [...steps];
  updatedSteps[existingIndex] = {
    ...existingStep,
    ...nextStep,
    startedAt: nextStep.startedAt ?? existingStep.startedAt,
  };
  return updatedSteps.sort((left, right) => left.index - right.index);
}

function markRunningStepsTerminal(
  steps: AgentTaskLiveStep[] | undefined,
  status: 'done' | 'failed',
): AgentTaskLiveStep[] | undefined {
  if (!steps || steps.length === 0) {
    return steps;
  }

  let changed = false;
  const completedAt = new Date();
  const nextSteps = steps.map((step) => {
    if (step.status !== 'running') {
      return step;
    }

    changed = true;
    return {
      ...step,
      status,
      completedAt,
    };
  });

  return changed ? nextSteps : steps;
}

function capLiveTaskRecord<T>(record: Record<string, T>): Record<string, T> {
  const entries = Object.entries(record);
  if (entries.length <= MAX_LIVE_TASK_ENTRIES) {
    return record;
  }

  return Object.fromEntries(entries.slice(-MAX_LIVE_TASK_ENTRIES));
}

export function applyAgentTaskGoalSubmitted(payload: AgiGoalSubmittedPayload): void {
  useAgentTaskStore.setState((state) => {
    const existingTask = state.tasks.find((task) => task.id === payload.goal_id);
    if (existingTask) {
      return {
        tasks: state.tasks.map((task) =>
          task.id === payload.goal_id
            ? {
                ...task,
                goal: task.goal || payload.description,
              }
            : task,
        ),
      };
    }

    return {
      tasks: [
        ...state.tasks,
        {
          id: payload.goal_id,
          goal: payload.description,
          status: 'queued',
          createdAt: new Date().toISOString(),
        },
      ],
    };
  });
}

export function applyAgentTaskGoalPlanCreated(payload: AgiGoalPlanCreatedPayload): void {
  useAgentTaskStore.setState((state) => ({
    liveProgressByTask: capLiveTaskRecord({
      ...state.liveProgressByTask,
      [payload.goal_id]: { step: 0, total: payload.total_steps },
    }),
  }));
}

export function applyAgentTaskGoalStepStarted(payload: AgiGoalStepStartedPayload): void {
  useAgentTaskStore.setState((state) => {
    const existingSteps = state.liveStepsByTask[payload.goal_id] ?? [];
    const nextStep: AgentTaskLiveStep = {
      id: payload.step_id,
      index: payload.step_index,
      description: payload.description,
      status: 'running',
      startedAt: new Date(),
    };

    return {
      liveStepsByTask: capLiveTaskRecord({
        ...state.liveStepsByTask,
        [payload.goal_id]: upsertLiveStep(existingSteps, nextStep),
      }),
      liveProgressByTask: capLiveTaskRecord({
        ...state.liveProgressByTask,
        [payload.goal_id]: {
          step: Math.max(
            payload.step_index + 1,
            state.liveProgressByTask[payload.goal_id]?.step ?? 0,
          ),
          total: payload.total_steps,
        },
      }),
    };
  });
}

export function applyAgentTaskGoalStepCompleted(payload: AgiGoalStepCompletedPayload): void {
  useAgentTaskStore.setState((state) => {
    const existingSteps = state.liveStepsByTask[payload.goal_id] ?? [];
    const existingStep = existingSteps.find((step) => step.id === payload.step_id);
    const nextStep: AgentTaskLiveStep = {
      id: payload.step_id,
      index: payload.step_index,
      description: existingStep?.description ?? `Step ${payload.step_index + 1}`,
      status: payload.success ? 'done' : 'failed',
      startedAt: existingStep?.startedAt,
      completedAt: new Date(),
      executionTimeMs: payload.execution_time_ms,
      error: payload.error,
    };

    return {
      liveStepsByTask: capLiveTaskRecord({
        ...state.liveStepsByTask,
        [payload.goal_id]: upsertLiveStep(existingSteps, nextStep),
      }),
      liveProgressByTask: capLiveTaskRecord({
        ...state.liveProgressByTask,
        [payload.goal_id]: {
          step: Math.max(
            payload.step_index + 1,
            state.liveProgressByTask[payload.goal_id]?.step ?? 0,
          ),
          total: payload.total_steps,
        },
      }),
    };
  });
}

export function applyAgentTaskGoalProgress(payload: AgiGoalProgressPayload): void {
  useAgentTaskStore.setState((state) => ({
    tasks: state.tasks.map((task) =>
      task.id === payload.goal_id
        ? {
            ...task,
            iterations: payload.completed_steps,
          }
        : task,
    ),
    liveProgressByTask: capLiveTaskRecord({
      ...state.liveProgressByTask,
      [payload.goal_id]: {
        step: payload.completed_steps,
        total: payload.total_steps,
      },
    }),
  }));
}

export function applyAgentTaskGoalAchieved(payload: AgiGoalAchievedPayload): void {
  useAgentTaskStore.setState((state) => {
    const liveStepsByTask = { ...state.liveStepsByTask };
    const currentSteps = liveStepsByTask[payload.goal_id];
    if (currentSteps) {
      liveStepsByTask[payload.goal_id] =
        markRunningStepsTerminal(currentSteps, 'done') ?? currentSteps;
    }

    return {
      tasks: state.tasks.map((task) =>
        task.id === payload.goal_id
          ? {
              ...task,
              iterations: payload.completed_steps,
            }
          : task,
      ),
      liveStepsByTask: capLiveTaskRecord(liveStepsByTask),
      liveProgressByTask: capLiveTaskRecord({
        ...state.liveProgressByTask,
        [payload.goal_id]: {
          step: payload.completed_steps,
          total: payload.total_steps,
        },
      }),
    };
  });
}

export function applyAgentTaskGoalError(payload: AgiGoalErrorPayload): void {
  useAgentTaskStore.setState((state) => {
    const liveStepsByTask = { ...state.liveStepsByTask };
    const currentSteps = liveStepsByTask[payload.goal_id];
    if (currentSteps) {
      liveStepsByTask[payload.goal_id] =
        markRunningStepsTerminal(currentSteps, 'failed') ?? currentSteps;
    }

    return {
      tasks: state.tasks.map((task) =>
        task.id === payload.goal_id
          ? {
              ...task,
              error: payload.error,
            }
          : task,
      ),
      liveStepsByTask: capLiveTaskRecord(liveStepsByTask),
    };
  });
}

export function applyAgentTaskGoalExecutionStarted(
  payload: AgiGoalExecutionStartedPayload,
  executionMode: 'parallel' | 'swarm',
): void {
  useAgentTaskStore.setState((state) => {
    const existingIndex = state.tasks.findIndex((task) => task.id === payload.goal_id);
    if (existingIndex === -1) {
      return {
        tasks: [
          ...state.tasks,
          {
            id: payload.goal_id,
            goal: payload.description,
            status: 'queued',
            createdAt: new Date().toISOString(),
            executionMode,
          },
        ],
      };
    }

    const existing = state.tasks[existingIndex]!;
    const tasks = [...state.tasks];
    tasks[existingIndex] = {
      ...existing,
      goal: existing.goal || payload.description,
      executionMode,
    };
    return { tasks };
  });
}

export function applyAgentTaskGoalExecutionCompleted(
  payload: AgiGoalExecutionCompletedPayload,
): void {
  useAgentTaskStore.setState((state) => ({
    tasks: state.tasks.map((task) =>
      task.id === payload.goal_id
        ? {
            ...task,
            error: payload.error ?? task.error,
          }
        : task,
    ),
  }));
}

function isTerminalAgentTaskStatus(status: AgentTaskStatus): boolean {
  return (
    status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'archived'
  );
}

export function applyAgentTaskStateChanged(payload: AgentTaskStateChanged): void {
  useAgentTaskStore.setState((state) => {
    const completedAt =
      isTerminalAgentTaskStatus(payload.state) || payload.state === 'ready_for_review'
        ? new Date().toISOString()
        : undefined;
    const existingIndex = state.tasks.findIndex((task) => task.id === payload.taskId);
    if (existingIndex === -1) {
      return {
        tasks: [
          ...state.tasks,
          {
            id: payload.taskId,
            goal: '',
            status: payload.state,
            createdAt: new Date().toISOString(),
            completedAt,
            error: payload.state === 'failed' ? payload.summary : undefined,
          },
        ],
      };
    }

    const tasks = [...state.tasks];
    const existing = tasks[existingIndex]!;
    tasks[existingIndex] = {
      ...existing,
      status: payload.state,
      completedAt,
      pauseReason: payload.state === 'paused' ? payload.summary : undefined,
      error:
        payload.state === 'failed'
          ? payload.summary
          : payload.state === 'running'
            ? undefined
            : existing.error,
    };
    return { tasks };
  });
}

let agentTaskEventListenersInitialized = false;
const agentTaskUnlistenFunctions: Array<() => void> = [];

export function cleanupAgentTaskEventListeners(): void {
  for (const unlisten of agentTaskUnlistenFunctions) {
    try {
      unlisten();
    } catch (error) {
      console.error('[AgentTaskStore] Failed to cleanup listener:', error);
    }
  }
  agentTaskUnlistenFunctions.length = 0;
  agentTaskEventListenersInitialized = false;
}

export async function initializeAgentTaskEventListeners(): Promise<void> {
  if (agentTaskEventListenersInitialized || !isTauri) {
    return;
  }

  agentTaskEventListenersInitialized = true;

  try {
    agentTaskUnlistenFunctions.push(
      await listen<AgentTaskStateChanged>('agi:task:state_changed', ({ payload }) => {
        applyAgentTaskStateChanged(payload);
      }),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalExecutionStartedPayload>('agi:goal:parallel_submitted', ({ payload }) => {
        applyAgentTaskGoalExecutionStarted(payload, 'parallel');
      }),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalExecutionCompletedPayload>(
        'agi:goal:parallel_best_result',
        ({ payload }) => {
          applyAgentTaskGoalExecutionCompleted(payload);
        },
      ),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalExecutionStartedPayload>('agi:goal:swarm_submitted', ({ payload }) => {
        applyAgentTaskGoalExecutionStarted(payload, 'swarm');
      }),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalExecutionCompletedPayload>('agi:goal:swarm_completed', ({ payload }) => {
        applyAgentTaskGoalExecutionCompleted(payload);
      }),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalSubmittedPayload>('agi:goal:submitted', ({ payload }) => {
        applyAgentTaskGoalSubmitted(payload);
      }),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalPlanCreatedPayload>('agi:goal:plan_created', ({ payload }) => {
        applyAgentTaskGoalPlanCreated(payload);
      }),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalStepStartedPayload>('agi:goal:step_started', ({ payload }) => {
        applyAgentTaskGoalStepStarted(payload);
      }),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalStepCompletedPayload>('agi:goal:step_completed', ({ payload }) => {
        applyAgentTaskGoalStepCompleted(payload);
      }),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalProgressPayload>('agi:goal:progress', ({ payload }) => {
        applyAgentTaskGoalProgress(payload);
      }),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalAchievedPayload>('agi:goal:achieved', ({ payload }) => {
        applyAgentTaskGoalAchieved(payload);
      }),
    );

    agentTaskUnlistenFunctions.push(
      await listen<AgiGoalErrorPayload>('agi:goal:error', ({ payload }) => {
        applyAgentTaskGoalError(payload);
      }),
    );
  } catch (error) {
    cleanupAgentTaskEventListeners();
    console.error('[AgentTaskStore] Failed to initialize event listeners:', error);
  }
}
