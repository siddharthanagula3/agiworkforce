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
import { useChatModelStore } from '@agiworkforce/unified-chat';

const MAX_LIVE_TASK_ENTRIES = 100;

/**
 * Parallel agents are not iterations: each one is a separate planning call plus
 * its own sandbox, and the Rust planner only has eight distinct strategies
 * (`clamp_num_agents` in `sys/commands/agi.rs` enforces the same ceiling).
 */
export const MAX_PARALLEL_AGENTS = 8;
export const DEFAULT_PARALLEL_AGENTS = 4;
/** The engine caps `max_steps` at 1000; the launcher stays well inside that. */
export const MAX_GOAL_ITERATIONS = 20;
export const DEFAULT_GOAL_ITERATIONS = 10;

const clampInteger = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.floor(value)));

const parallelAgentCount = (requested: number | undefined): number =>
  requested === undefined || !Number.isFinite(requested)
    ? DEFAULT_PARALLEL_AGENTS
    : clampInteger(requested, 1, MAX_PARALLEL_AGENTS);

/** `undefined` leaves the engine's own iteration limit in place. */
const goalIterationLimit = (requested: number | undefined): number | undefined =>
  requested === undefined || !Number.isFinite(requested)
    ? undefined
    : clampInteger(requested, 1, MAX_GOAL_ITERATIONS);

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

interface GoalModelTarget {
  modelId?: string;
  provider?: string;
}

function captureGoalModelTarget(target?: GoalModelTarget): { modelId: string; provider: string } {
  const modelState = useChatModelStore.getState();
  const selected = modelState.getSelectedModel();
  const modelId = target?.modelId?.trim() || selected?.id.trim();
  const provider = target?.provider?.trim() || selected?.provider.trim();

  if (!modelId || !provider) {
    throw new Error('Choose an available model before launching a Task.');
  }

  return { modelId, provider };
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
    options?: {
      /** Sequential only: iteration ceiling for the engine's execute/reflect loop. */
      maxIterations?: number;
      /** Parallel only: how many agents race the goal in their own sandboxes. */
      numAgents?: number;
      parallel?: boolean;
    } & GoalSubmissionAuthority &
      GoalModelTarget,
  ) => Promise<string>;
  submitGoalSwarm: (
    goal: string,
    options?: {
      priority?: string;
      deadline?: number;
      successCriteria?: string[];
    } & GoalSubmissionAuthority &
      GoalModelTarget,
  ) => Promise<string>;
  submitGoalAuto: (
    goal: string,
    options?: {
      priority?: string;
      deadline?: number;
      successCriteria?: string[];
    } & GoalSubmissionAuthority &
      GoalModelTarget,
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
  state: AgentTaskStatus;
  output?: string | null;
  error?: string | null;
}

interface GoalStatusResponse {
  // ExecutionContext is a Rust-native structure and intentionally keeps its
  // snake_case wire names. Live events use the separate camelCase protocol.
  context: { tool_results: Array<{ result?: unknown; error?: string | null }> };
  state: AgentTaskStatus;
  currentIteration: number;
}

interface NativeTaskSnapshot {
  state: AgentTaskStatus;
  context?: GoalStatusResponse['context'];
  currentIteration?: number;
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
            const modelTarget = captureGoalModelTarget(options);
            await ensureAgiInitialized();
            authority.assertCurrent();
            if (options.parallel) {
              const result = await invoke<SubmitParallelGoalResponse>('agi_submit_goal_parallel', {
                request: {
                  description: goal,
                  priority: 'medium',
                  numAgents: parallelAgentCount(options.numAgents),
                  trustMode: authority.trustMode,
                  ...modelTarget,
                },
              });
              const taskId = result.goalId;
              set((state) => ({
                tasks: upsertSubmittedAgentTask(
                  state.tasks,
                  {
                    id: taskId,
                    goal,
                    status: result.state,
                    createdAt: new Date().toISOString(),
                    completedAt:
                      isTerminalAgentTaskStatus(result.state) || result.state === 'ready_for_review'
                        ? new Date().toISOString()
                        : undefined,
                    result: result.output ?? undefined,
                    error: result.error ?? undefined,
                    executionMode: 'parallel',
                  },
                  true,
                ),
              }));
              return taskId;
            }

            const result = await invoke<SubmitGoalResponse>('agi_submit_goal', {
              request: {
                description: goal,
                priority: 'medium',
                maxSteps: goalIterationLimit(options.maxIterations),
                trustMode: authority.trustMode,
                ...modelTarget,
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
              const message = error instanceof Error ? error.message : String(error);
              toast.error(`Failed to submit goal: ${message || 'Unknown error'}`);
            }
            throw error;
          }
        },

        submitGoalSwarm: async (goal, options = {}) => {
          try {
            const authority = captureGoalSubmissionAuthority(options);
            const modelTarget = captureGoalModelTarget(options);
            await ensureAgiInitialized();
            authority.assertCurrent();
            const result = await invoke<SwarmGoalResponse>('agi_submit_goal_swarm', {
              request: {
                description: goal,
                priority: options.priority ?? 'medium',
                deadline: options.deadline,
                successCriteria: options.successCriteria,
                trustMode: authority.trustMode,
                ...modelTarget,
              },
            });

            const taskId = result.goalId;
            const status: AgentTaskStatus = result.success ? 'ready_for_review' : 'failed';
            set((state) => ({
              tasks: upsertSubmittedAgentTask(
                state.tasks,
                {
                  id: taskId,
                  goal,
                  status,
                  createdAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                  result: result.summary,
                  error: result.success ? undefined : result.summary,
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
                },
                true,
              ),
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
            const modelTarget = captureGoalModelTarget(options);
            await ensureAgiInitialized();
            authority.assertCurrent();
            const result = await invoke<SubmitGoalResponse>('agi_submit_goal_auto', {
              request: {
                description: goal,
                priority: options.priority ?? 'medium',
                deadline: options.deadline,
                successCriteria: options.successCriteria,
                trustMode: authority.trustMode,
                ...modelTarget,
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
            const backendIds = new Set(goals.map((g) => g.id));
            const recoveryEntries = await Promise.all(
              existingTasks
                .filter((task) => isActiveAgentTaskStatus(task.status) && !backendIds.has(task.id))
                .map(async (task) => [task.id, await readNativeTaskSnapshot(task.id)] as const),
            );
            const recoveryByTaskId = new Map(recoveryEntries);
            const recoveredAt = new Date().toISOString();

            set((state) => {
              // Events can arrive while recovery IPC is in flight. Merge
              // against the current store, not the snapshot captured above.
              const updatedTasks = goals.map((goal) => {
                const existing = state.tasks.find((task) => task.id === goal.id);
                return {
                  id: goal.id,
                  goal: goal.description,
                  status: existing?.status ?? ('queued' as AgentTaskStatus),
                  createdAt: existing?.createdAt ?? recoveredAt,
                  completedAt: existing?.completedAt,
                  iterations: existing?.iterations,
                  result: existing?.result,
                  insights: existing?.insights,
                  error: existing?.error,
                  executionMode: existing?.executionMode,
                  swarmMetrics: existing?.swarmMetrics,
                  pauseReason: existing?.pauseReason,
                };
              });

              const localOnly = state.tasks
                .filter((task) => !backendIds.has(task.id))
                .map((task) => {
                  if (!isActiveAgentTaskStatus(task.status) || !recoveryByTaskId.has(task.id)) {
                    return task;
                  }
                  const snapshot = recoveryByTaskId.get(task.id);
                  return snapshot
                    ? mergeNativeTaskSnapshot(task, snapshot, recoveredAt)
                    : markTaskInterruptedByRestart(task, recoveredAt);
                });

              return { tasks: [...updatedTasks, ...localOnly], loading: false };
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[AgentTaskStore] Failed to fetch tasks:', err);
            toast.error('Failed to load agent tasks: ' + msg);
            set({ loading: false });
          }
        },

        getTaskStatus: async (taskId) => {
          const snapshot = await readNativeTaskSnapshot(taskId);
          if (!snapshot) return null;

          const recoveredAt = new Date().toISOString();
          set((state) => ({
            tasks: state.tasks.map((task) =>
              task.id === taskId ? mergeNativeTaskSnapshot(task, snapshot, recoveredAt) : task,
            ),
          }));

          return get().tasks.find((task) => task.id === taskId) ?? null;
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

function upsertSubmittedAgentTask(
  tasks: AgentTask[],
  submitted: AgentTask,
  authoritativeResult = false,
): AgentTask[] {
  const existingIndex = tasks.findIndex((task) => task.id === submitted.id);
  if (existingIndex === -1) {
    return [...tasks, submitted];
  }

  const existing = tasks[existingIndex]!;
  const nextTasks = [...tasks];
  nextTasks[existingIndex] = authoritativeResult
    ? {
        ...existing,
        ...submitted,
        goal: existing.goal || submitted.goal,
        createdAt: existing.createdAt,
        executionMode: existing.executionMode ?? submitted.executionMode,
      }
    : {
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

function isActiveAgentTaskStatus(status: AgentTaskStatus): boolean {
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'awaiting_input' ||
    status === 'paused'
  );
}

async function readNativeTaskSnapshot(taskId: string): Promise<NativeTaskSnapshot | null> {
  try {
    return await invoke<GoalStatusResponse>('agi_get_goal_status', { goalId: taskId });
  } catch {
    // Swarm execution has a canonical task state but intentionally does not
    // retain the sequential engine's ExecutionContext. The state-only command
    // also returns null when a fresh process has no ownership of this task.
    try {
      const state = await invoke<AgentTaskStatus | null>('agi_get_task_state', { goalId: taskId });
      return state ? { state } : null;
    } catch {
      return null;
    }
  }
}

function mergeNativeTaskSnapshot(
  task: AgentTask,
  snapshot: NativeTaskSnapshot,
  recoveredAt: string,
): AgentTask {
  // `?.` on `context` but not on `tool_results`: the type declares the array
  // required, but this value crosses the Rust IPC boundary, so that is a claim
  // rather than a guarantee. A context that arrives without the array threw
  // "Cannot read properties of undefined (reading 'at')" out of pauseTask and
  // resumeTask, which caught it and surfaced a generic failure toast — so a
  // paused task looked like a failed one.
  const lastResult = snapshot.context?.tool_results?.at(-1);
  return {
    ...task,
    status: snapshot.state,
    iterations: snapshot.currentIteration ?? task.iterations,
    result:
      lastResult?.result === undefined
        ? task.result
        : typeof lastResult.result === 'string'
          ? lastResult.result
          : JSON.stringify(lastResult.result),
    error: snapshot.state === 'running' ? undefined : (lastResult?.error ?? task.error),
    completedAt:
      isTerminalAgentTaskStatus(snapshot.state) || snapshot.state === 'ready_for_review'
        ? (task.completedAt ?? recoveredAt)
        : undefined,
  };
}

function markTaskInterruptedByRestart(task: AgentTask, recoveredAt: string): AgentTask {
  return {
    ...task,
    status: 'failed',
    completedAt: task.completedAt ?? recoveredAt,
    pauseReason: undefined,
    error:
      'The Desktop runtime ended before this Task reported a final result. Its native execution state cannot be recovered; review any external changes before retrying.',
  };
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
