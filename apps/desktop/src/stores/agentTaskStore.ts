import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { invoke, isTauri, listen } from '../lib/tauri-mock';

const MAX_LIVE_TASK_ENTRIES = 100;

/**
 * Agent task status lifecycle.
 * Core states: pending, running, completed, failed, cancelled
 * Recovery states: paused, expired, recovering
 */
export type AgentTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'expired'
  | 'recovering';

/**
 * Recovery action that can be applied to a failed/paused/expired task.
 */
export type AgentRecoveryAction =
  | 'retry-from-checkpoint'
  | 'restart-from-beginning'
  | 'abandon-with-summary';

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
  /** Last checkpoint iteration for recovery */
  lastCheckpointIteration?: number;
  /** Timestamp of last checkpoint */
  lastCheckpointAt?: string;
  /** Recovery summary when task is abandoned */
  recoverySummary?: string;
  /** How many times this task has been retried */
  retryCount?: number;
  /** Reason the task was paused or expired */
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

interface AgentTaskState {
  tasks: AgentTask[];
  loading: boolean;
  liveStepsByTask: Record<string, AgentTaskLiveStep[]>;
  liveProgressByTask: Record<string, AgentTaskLiveProgress>;
  submitGoal: (
    goal: string,
    options?: { maxIterations?: number; parallel?: boolean },
  ) => Promise<string>;
  submitGoalSwarm: (
    goal: string,
    options?: { priority?: string; deadline?: number; successCriteria?: string[] },
  ) => Promise<string>;
  submitGoalAuto: (
    goal: string,
    options?: { priority?: string; deadline?: number; successCriteria?: string[] },
  ) => Promise<string>;
  shouldUseSwarm: (description: string) => Promise<boolean>;
  fetchTasks: () => Promise<void>;
  getTaskStatus: (taskId: string) => Promise<AgentTask | null>;
  cancelTask: (taskId: string) => Promise<void>;
  fetchInsights: (taskId: string) => Promise<string[]>;
  /** Pause a running task */
  pauseTask: (taskId: string, reason?: string) => void;
  /** Resume a paused task */
  resumeTask: (taskId: string) => void;
  /** Mark a task as expired (e.g., approval timeout, execution timeout) */
  expireTask: (taskId: string, reason?: string) => void;
  /** Retry a failed/expired task from its last checkpoint */
  retryFromCheckpoint: (taskId: string) => Promise<string | null>;
  /** Restart a task from the very beginning */
  restartFromBeginning: (taskId: string) => Promise<string | null>;
  /** Abandon a task and generate a summary of what was accomplished */
  abandonWithSummary: (taskId: string) => void;
  /** Get a human-readable label for the current task status */
  getStatusLabel: (status: AgentTaskStatus) => string;
  /** Check if a task is in a recoverable state */
  isRecoverable: (taskId: string) => boolean;
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

interface GoalStatusResponse {
  context: {
    currentIteration: number;
    status: string;
    result?: string;
    error?: string;
  };
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

export const useAgentTaskStore = create<AgentTaskState>()(
  devtools(
    persist(
      (set, get) => ({
        tasks: [],
        loading: false,
        liveStepsByTask: {},
        liveProgressByTask: {},

        submitGoal: async (goal, options = {}) => {
          try {
            if (options.parallel) {
              const result = await invoke<{ bestResult: { score: number } }>(
                'agi_submit_goal_parallel',
                {
                  request: {
                    description: goal,
                    priority: 'medium',
                    numAgents: options.maxIterations ?? 4,
                  },
                },
              );
              const taskId = `parallel_${Date.now()}`;
              set((state) => ({
                tasks: [
                  ...state.tasks,
                  {
                    id: taskId,
                    goal,
                    status: 'completed' as const,
                    createdAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                    result: `Parallel execution complete. Best score: ${result.bestResult.score}`,
                  },
                ],
              }));
              return taskId;
            }

            const result = await invoke<SubmitGoalResponse>('agi_submit_goal', {
              request: {
                description: goal,
                priority: 'medium',
              },
            });

            const taskId = result.goalId;

            set((state) => ({
              tasks: [
                ...state.tasks,
                {
                  id: taskId,
                  goal,
                  status: 'pending' as const,
                  createdAt: new Date().toISOString(),
                },
              ],
            }));

            return taskId;
          } catch (error) {
            toast.error(
              `Failed to submit goal: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            throw error;
          }
        },

        submitGoalSwarm: async (goal, options = {}) => {
          try {
            const result = await invoke<SwarmGoalResponse>('agi_submit_goal_swarm', {
              request: {
                description: goal,
                priority: options.priority ?? 'medium',
                deadline: options.deadline,
                successCriteria: options.successCriteria,
              },
            });

            const taskId = result.goalId;
            set((state) => ({
              tasks: [
                ...state.tasks,
                {
                  id: taskId,
                  goal,
                  status: (result.success ? 'completed' : 'failed') as AgentTask['status'],
                  createdAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                  result: result.summary,
                  executionMode: 'swarm' as const,
                  swarmMetrics: {
                    succeeded: result.succeeded,
                    failed: result.failed,
                    wallTimeMs: result.wallTimeMs,
                    speedupRatio: result.speedupRatio,
                    criticalPathLength: result.criticalPathLength,
                    maxParallelism: result.maxParallelism,
                    summary: result.summary,
                  },
                },
              ],
            }));
            return taskId;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error('Swarm execution failed: ' + msg);
            throw err;
          }
        },

        submitGoalAuto: async (goal, options = {}) => {
          try {
            const result = await invoke<SubmitGoalResponse>('agi_submit_goal_auto', {
              request: {
                description: goal,
                priority: options.priority ?? 'medium',
                deadline: options.deadline,
                successCriteria: options.successCriteria,
              },
            });

            const taskId = result.goalId;
            set((state) => ({
              tasks: [
                ...state.tasks,
                {
                  id: taskId,
                  goal,
                  status: 'pending' as const,
                  createdAt: new Date().toISOString(),
                  executionMode: 'auto' as const,
                },
              ],
            }));
            return taskId;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error('Auto goal submission failed: ' + msg);
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
                status: (existing?.status ?? 'pending') as AgentTask['status'],
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

            const ctx = response.context;
            const statusMap: Record<string, AgentTaskStatus> = {
              running: 'running',
              completed: 'completed',
              failed: 'failed',
              cancelled: 'cancelled',
              pending: 'pending',
              paused: 'paused',
              expired: 'expired',
              recovering: 'recovering',
            };
            const mappedStatus = statusMap[ctx.status] ?? 'pending';

            set((state) => ({
              tasks: state.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: mappedStatus,
                      iterations: ctx.currentIteration,
                      result: ctx.result,
                      error: ctx.error,
                      completedAt:
                        mappedStatus === 'completed' || mappedStatus === 'failed'
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
            set((state) => ({
              tasks: state.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: 'cancelled' as AgentTaskStatus,
                      completedAt: new Date().toISOString(),
                    }
                  : t,
              ),
            }));
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

        pauseTask: (taskId, reason) => {
          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === taskId && t.status === 'running'
                ? {
                    ...t,
                    status: 'paused' as AgentTaskStatus,
                    pauseReason: reason ?? 'Paused by user',
                    lastCheckpointIteration: t.iterations,
                    lastCheckpointAt: new Date().toISOString(),
                  }
                : t,
            ),
          }));
          toast.info('Agent task paused');
        },

        resumeTask: (taskId) => {
          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === taskId && (t.status === 'paused' || t.status === 'expired')
                ? {
                    ...t,
                    status: 'running' as AgentTaskStatus,
                    pauseReason: undefined,
                  }
                : t,
            ),
          }));
          toast.info('Agent task resumed');
        },

        expireTask: (taskId, reason) => {
          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === taskId && (t.status === 'running' || t.status === 'paused')
                ? {
                    ...t,
                    status: 'expired' as AgentTaskStatus,
                    pauseReason: reason ?? 'Task expired',
                    completedAt: new Date().toISOString(),
                    lastCheckpointIteration: t.iterations,
                    lastCheckpointAt: new Date().toISOString(),
                  }
                : t,
            ),
          }));
        },

        retryFromCheckpoint: async (taskId) => {
          const task = get().tasks.find((t) => t.id === taskId);
          if (!task) return null;
          if (task.status !== 'failed' && task.status !== 'expired' && task.status !== 'paused') {
            toast.error('Only failed, expired, or paused tasks can be retried');
            return null;
          }

          // Mark as recovering
          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'recovering' as AgentTaskStatus,
                    error: undefined,
                    retryCount: (t.retryCount ?? 0) + 1,
                  }
                : t,
            ),
          }));

          try {
            const result = await invoke<SubmitGoalResponse>('agi_submit_goal', {
              request: {
                description: task.goal,
                priority: 'medium',
              },
            });

            const newTaskId = result.goalId;

            // Update the original task as abandoned and create a new one
            set((state) => ({
              tasks: [
                ...state.tasks.map((t) =>
                  t.id === taskId
                    ? {
                        ...t,
                        status: 'cancelled' as AgentTaskStatus,
                        recoverySummary: `Retried from checkpoint (iteration ${task.lastCheckpointIteration ?? 0}). New task: ${newTaskId}`,
                      }
                    : t,
                ),
                {
                  id: newTaskId,
                  goal: task.goal,
                  status: 'pending' as AgentTaskStatus,
                  createdAt: new Date().toISOString(),
                  iterations: task.lastCheckpointIteration ?? 0,
                  retryCount: (task.retryCount ?? 0) + 1,
                  executionMode: task.executionMode,
                },
              ],
            }));

            toast.success('Task retried from last checkpoint');
            return newTaskId;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            set((state) => ({
              tasks: state.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: 'failed' as AgentTaskStatus,
                      error: `Retry failed: ${msg}`,
                    }
                  : t,
              ),
            }));
            toast.error('Failed to retry task: ' + msg);
            return null;
          }
        },

        restartFromBeginning: async (taskId) => {
          const task = get().tasks.find((t) => t.id === taskId);
          if (!task) return null;
          if (
            task.status !== 'failed' &&
            task.status !== 'expired' &&
            task.status !== 'paused' &&
            task.status !== 'cancelled'
          ) {
            toast.error('Only failed, expired, paused, or cancelled tasks can be restarted');
            return null;
          }

          // Mark as recovering
          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'recovering' as AgentTaskStatus,
                    error: undefined,
                  }
                : t,
            ),
          }));

          try {
            const result = await invoke<SubmitGoalResponse>('agi_submit_goal', {
              request: {
                description: task.goal,
                priority: 'medium',
              },
            });

            const newTaskId = result.goalId;

            set((state) => ({
              tasks: [
                ...state.tasks.map((t) =>
                  t.id === taskId
                    ? {
                        ...t,
                        status: 'cancelled' as AgentTaskStatus,
                        recoverySummary: `Restarted from beginning. New task: ${newTaskId}`,
                      }
                    : t,
                ),
                {
                  id: newTaskId,
                  goal: task.goal,
                  status: 'pending' as AgentTaskStatus,
                  createdAt: new Date().toISOString(),
                  retryCount: (task.retryCount ?? 0) + 1,
                  executionMode: task.executionMode,
                },
              ],
            }));

            toast.success('Task restarted from the beginning');
            return newTaskId;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            set((state) => ({
              tasks: state.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: 'failed' as AgentTaskStatus,
                      error: `Restart failed: ${msg}`,
                    }
                  : t,
              ),
            }));
            toast.error('Failed to restart task: ' + msg);
            return null;
          }
        },

        abandonWithSummary: (taskId) => {
          const task = get().tasks.find((t) => t.id === taskId);
          if (!task) return;

          const iterationInfo = task.iterations
            ? `Completed ${task.iterations} iteration(s). `
            : '';
          const resultInfo = task.result ? `Last result: ${task.result}. ` : '';
          const errorInfo = task.error ? `Error: ${task.error}. ` : '';

          const summary = `Task abandoned. ${iterationInfo}${resultInfo}${errorInfo}Goal: ${task.goal}`;

          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'cancelled' as AgentTaskStatus,
                    completedAt: t.completedAt ?? new Date().toISOString(),
                    recoverySummary: summary,
                  }
                : t,
            ),
          }));
          toast.info('Task abandoned with summary saved');
        },

        getStatusLabel: (status) => {
          const labels: Record<AgentTaskStatus, string> = {
            pending: 'Pending',
            running: 'Running',
            completed: 'Completed',
            failed: 'Failed',
            cancelled: 'Cancelled',
            paused: 'Paused',
            expired: 'Expired',
            recovering: 'Recovering',
          };
          return labels[status] ?? 'Unknown';
        },

        isRecoverable: (taskId) => {
          const task = get().tasks.find((t) => t.id === taskId);
          if (!task) return false;
          return task.status === 'failed' || task.status === 'expired' || task.status === 'paused';
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
          tasks: state.tasks
            .filter((t) => !t.id.startsWith('parallel_') && !t.id.startsWith('mock_swarm_'))
            .slice(-500), // Cap at 500 most recent tasks to prevent unbounded localStorage growth
        }),
      },
    ),
    { name: 'AgentTaskStore' },
  ),
);

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
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      ],
    };
  });
}

export function applyAgentTaskGoalPlanCreated(payload: AgiGoalPlanCreatedPayload): void {
  useAgentTaskStore.setState((state) => ({
    tasks: state.tasks.map((task) =>
      task.id === payload.goal_id && task.status === 'pending'
        ? { ...task, status: 'running' }
        : task,
    ),
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
      tasks: state.tasks.map((task) =>
        task.id === payload.goal_id
          ? {
              ...task,
              status: 'running',
            }
          : task,
      ),
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
            status: 'running',
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
              status: 'completed',
              completedAt: task.completedAt ?? new Date().toISOString(),
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
              status: 'failed',
              completedAt: task.completedAt ?? new Date().toISOString(),
              error: payload.error,
            }
          : task,
      ),
      liveStepsByTask: capLiveTaskRecord(liveStepsByTask),
    };
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
