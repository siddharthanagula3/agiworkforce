import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { invoke } from '../lib/tauri-mock';

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

export const useAgentTaskStore = create<AgentTaskState>()(
  devtools(
    persist(
      (set, get) => ({
        tasks: [],
        loading: false,

        submitGoal: async (goal, options = {}) => {
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
