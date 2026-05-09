// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
import { listen, isTauri } from '../lib/tauri-mock';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ResearchTask } from '../types/chat';
import type {
  ReflectionInsight,
  FailurePattern,
  Correction,
  SubGoal,
  FailedStep,
} from '../api/reflection';
import type { ActionType } from './browserStore';
import { useBrowserStore } from './browserStore';
import { useAgentTaskStore, type AgentTask, type AgentTaskLiveStep } from './agentTaskStore';

export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface ExecutionStep {
  id: string;
  goalId: string;
  index: number;
  description: string;
  status: StepStatus;
  startTime?: number;
  endTime?: number;
  executionTimeMs?: number;
  error?: string;
  llmReasoning?: string;
}

export interface TerminalLog {
  id: string;
  timestamp: number;
  command?: string;
  output: string;
  exitCode?: number;
  isError: boolean;
}

export interface BrowserAction {
  id: string;
  timestamp: number;
  type: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot';
  url?: string;
  selector?: string;
  value?: string;
  screenshotData?: string;
  success: boolean;
  error?: string;
}

export interface FileChange {
  id: string;
  timestamp: number;
  path: string;
  operation: 'create' | 'modify' | 'delete';
  oldContent?: string;
  newContent?: string;
  language?: string;
  accepted: boolean | null;
}

export interface ActiveGoal {
  id: string;
  description: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
  totalSteps: number;
  completedSteps: number;
  progressPercent: number;
}

export interface PanelState {
  visible: boolean;
  size: number;
}

/**
 * Reflection state for displaying AI learning and improvement suggestions.
 */
export interface ReflectionState {
  /** Most recent reflection insight */
  currentInsight: ReflectionInsight | null;
  /** Aggregated failure patterns across iterations */
  failurePatterns: FailurePattern[];
  /** Current suggested corrections */
  corrections: Correction[];
  /** Sub-goals derived from failed steps */
  subGoals: SubGoal[];
  /** AI-generated recommendations */
  recommendations: string[];
  /** Current iteration number */
  iteration: number;
  /** Whether a reflection is currently being processed */
  isReflecting: boolean;
  /** Whether the goal is considered achievable based on reflection */
  goalAchievable: boolean;
  /** Confidence score from 0-1 */
  confidence: number;
}

export type IterationStatus =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'reflecting'
  | 'completed'
  | 'failed'
  | 'paused';

export interface IterationHistoryRecord {
  iteration: number;
  stepsSucceeded: number;
  stepsFailed: number;
  consecutiveFailures: number;
  timestamp: number;
}

export interface PlanCritiqueState {
  iteration: number;
  qualityScore: number;
  likelyToSucceed: boolean;
  risksCount: number;
  suggestions: string[];
}

export interface IterationProgressState {
  goalId: string | null;
  status: IterationStatus;
  currentIteration: number;
  hasPriorReflection: boolean;
  consecutiveFailures: number;
  history: IterationHistoryRecord[];
  planCritique: PlanCritiqueState | null;
  startTime: number | null;
}

export interface ExecutionState {
  activeGoal: ActiveGoal | null;
  steps: ExecutionStep[];

  terminalLogs: TerminalLog[];
  terminalScrollLock: boolean;

  browserActions: BrowserAction[];
  currentBrowserUrl: string | null;
  currentScreenshot: string | null;

  fileChanges: FileChange[];

  researchTasks: Record<string, ResearchTask>;

  currentLLMStream: string;
  isStreaming: boolean;

  panelVisible: boolean;
  activeTab: 'thinking' | 'terminal' | 'browser' | 'files' | 'reflection';
  panelState: Record<string, PanelState>;

  /** Reflection engine state */
  reflection: ReflectionState;
  iterationProgress: IterationProgressState;

  setActiveGoal: (goal: ActiveGoal | null) => void;
  addStep: (step: ExecutionStep) => void;
  updateStep: (stepId: string, updates: Partial<ExecutionStep>) => void;
  appendLLMReasoning: (stepId: string, chunk: string) => void;

  addTerminalLog: (log: TerminalLog) => void;
  clearTerminalLogs: () => void;
  setTerminalScrollLock: (locked: boolean) => void;

  addResearchTask: (task: ResearchTask) => void;
  updateResearchTask: (id: string, updates: Partial<ResearchTask>) => void;

  addBrowserAction: (action: BrowserAction) => void;
  updateCurrentBrowserState: (url: string | null, screenshot: string | null) => void;

  addFileChange: (change: FileChange) => void;
  updateFileChange: (id: string, accepted: boolean) => void;
  clearFileChanges: () => void;

  appendLLMStream: (chunk: string) => void;
  clearLLMStream: () => void;
  setStreaming: (streaming: boolean) => void;

  setPanelVisible: (visible: boolean) => void;
  setActiveTab: (tab: ExecutionState['activeTab']) => void;
  togglePanel: () => void;

  /** Reflection actions */
  setReflectionInsight: (insight: ReflectionInsight) => void;
  addFailurePattern: (pattern: FailurePattern) => void;
  setCorrections: (corrections: Correction[]) => void;
  setSubGoals: (subGoals: SubGoal[]) => void;
  setRecommendations: (recommendations: string[]) => void;
  setReflecting: (isReflecting: boolean) => void;
  setIteration: (iteration: number) => void;
  clearReflection: () => void;

  /** Clean up execution contexts for a completed or failed goal (keeps goal state for UI display) */
  cleanupGoalContexts: () => void;

  reset: () => void;
}

const initialReflectionState: ReflectionState = {
  currentInsight: null,
  failurePatterns: [],
  corrections: [],
  subGoals: [],
  recommendations: [],
  iteration: 0,
  isReflecting: false,
  goalAchievable: true,
  confidence: 1.0,
};

const initialIterationProgressState: IterationProgressState = {
  goalId: null,
  status: 'idle',
  currentIteration: 0,
  hasPriorReflection: false,
  consecutiveFailures: 0,
  history: [],
  planCritique: null,
  startTime: null,
};

const initialState = {
  activeGoal: null,
  steps: [],
  terminalLogs: [],
  terminalScrollLock: true,
  browserActions: [],
  currentBrowserUrl: null,
  currentScreenshot: null,
  fileChanges: [],
  researchTasks: {},
  currentLLMStream: '',
  isStreaming: false,
  panelVisible: false,
  activeTab: 'thinking' as const,
  panelState: {
    thinking: { visible: true, size: 50 },
    terminal: { visible: true, size: 50 },
    browser: { visible: true, size: 50 },
    files: { visible: true, size: 50 },
    reflection: { visible: true, size: 50 },
  },
  reflection: initialReflectionState,
  iterationProgress: initialIterationProgressState,
};

// Stream timeout management
let streamTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let goalCleanupTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
const STREAM_TIMEOUT_MS = 60000; // 60 seconds timeout for stuck streams

function startStreamTimeout() {
  clearStreamTimeout();
  streamTimeoutHandle = setTimeout(() => {
    console.warn('[ExecutionStore] Stream timeout triggered - clearing stuck streaming state');
    useExecutionStore.getState().setStreaming(false);
  }, STREAM_TIMEOUT_MS);
}

function clearStreamTimeout() {
  if (streamTimeoutHandle) {
    clearTimeout(streamTimeoutHandle);
    streamTimeoutHandle = null;
  }
}

function clearGoalCleanupTimeout() {
  if (goalCleanupTimeoutHandle) {
    clearTimeout(goalCleanupTimeoutHandle);
    goalCleanupTimeoutHandle = null;
  }
}

export const useExecutionStore = create<ExecutionState>()(
  immer((set) => ({
    ...initialState,

    setActiveGoal: (goal) => {
      set((state) => {
        state.activeGoal = goal;
      });
    },

    addStep: (step) => {
      set((state) => {
        state.steps.push(step);
        // AUDIT-006-006 fix: Cap steps at 200 entries
        if (state.steps.length > 200) {
          state.steps = state.steps.slice(-200);
        }
      });
    },

    updateStep: (stepId, updates) => {
      set((state) => {
        const step = state.steps.find((s) => s.id === stepId);
        if (step) {
          Object.assign(step, updates);
        }
      });
    },

    appendLLMReasoning: (stepId, chunk) => {
      set((state) => {
        const step = state.steps.find((s) => s.id === stepId);
        if (step) {
          step.llmReasoning = (step.llmReasoning || '') + chunk;
        }
      });
    },

    addTerminalLog: (log) => {
      set((state) => {
        state.terminalLogs.push(log);

        if (state.terminalLogs.length > 1000) {
          state.terminalLogs = state.terminalLogs.slice(-1000);
        }
      });
    },

    clearTerminalLogs: () => {
      set((state) => {
        state.terminalLogs = [];
      });
    },

    setTerminalScrollLock: (locked) => {
      set((state) => {
        state.terminalScrollLock = locked;
      });
    },

    addResearchTask: (task) =>
      set((state) => {
        state.researchTasks[task.id] = task;
      }),

    updateResearchTask: (id, updates) =>
      set((state) => {
        if (state.researchTasks[id]) {
          Object.assign(state.researchTasks[id]!, updates);
        }
      }),

    addBrowserAction: (action) => {
      set((state) => {
        state.browserActions.push(action);

        if (state.browserActions.length > 100) {
          state.browserActions = state.browserActions.slice(-100);
        }

        if (action.screenshotData) {
          state.currentScreenshot = action.screenshotData;
        }
      });
    },

    updateCurrentBrowserState: (url, screenshot) => {
      set((state) => {
        state.currentBrowserUrl = url;
        if (screenshot) {
          state.currentScreenshot = screenshot;
        }
      });
    },

    addFileChange: (change) => {
      set((state) => {
        state.fileChanges.push(change);

        // AUDIT-006-005: Cap fileChanges at 500 entries, keeping newest (FIFO eviction)
        if (state.fileChanges.length > 500) {
          state.fileChanges = state.fileChanges.slice(-500);
        }
      });
    },

    updateFileChange: (id, accepted) => {
      set((state) => {
        const change = state.fileChanges.find((c) => c.id === id);
        if (change) {
          change.accepted = accepted;
        }
      });
    },

    clearFileChanges: () => {
      set((state) => {
        state.fileChanges = [];
      });
    },

    appendLLMStream: (chunk) => {
      set((state) => {
        state.currentLLMStream += chunk;
      });
    },

    clearLLMStream: () => {
      set((state) => {
        state.currentLLMStream = '';
      });
    },

    setStreaming: (streaming) => {
      set((state) => {
        state.isStreaming = streaming;
      });
      // Manage stream timeout
      if (streaming) {
        startStreamTimeout();
      } else {
        clearStreamTimeout();
      }
    },

    setPanelVisible: (visible) => {
      set((state) => {
        state.panelVisible = visible;
      });
    },

    setActiveTab: (tab) => {
      set((state) => {
        state.activeTab = tab;
      });
    },

    togglePanel: () => {
      set((state) => {
        state.panelVisible = !state.panelVisible;
      });
    },

    // Reflection actions
    setReflectionInsight: (insight) => {
      set((state) => {
        state.reflection.currentInsight = insight;
        state.reflection.goalAchievable = insight.assessment.goalAchievable;
        state.reflection.confidence = insight.confidence;
        // Also update corrections, sub-goals, and recommendations from the insight
        state.reflection.corrections = insight.corrections;
        state.reflection.subGoals = insight.subGoals;
        state.reflection.recommendations = insight.recommendations;
      });
    },

    addFailurePattern: (pattern) => {
      set((state) => {
        // Check if pattern already exists by category
        const existingIndex = state.reflection.failurePatterns.findIndex(
          (p) => p.category === pattern.category,
        );
        if (existingIndex >= 0) {
          // Update frequency and merge affected steps
          const existing = state.reflection.failurePatterns[existingIndex]!;
          existing.frequency += pattern.frequency;
          pattern.affectedSteps.forEach((step) => {
            if (!existing.affectedSteps.includes(step)) {
              existing.affectedSteps.push(step);
            }
          });
        } else {
          state.reflection.failurePatterns.push(pattern);
        }
      });
    },

    setCorrections: (corrections) => {
      set((state) => {
        state.reflection.corrections = corrections;
      });
    },

    setSubGoals: (subGoals) => {
      set((state) => {
        state.reflection.subGoals = subGoals;
      });
    },

    setRecommendations: (recommendations) => {
      set((state) => {
        state.reflection.recommendations = recommendations;
      });
    },

    setReflecting: (isReflecting) => {
      set((state) => {
        state.reflection.isReflecting = isReflecting;
      });
    },

    setIteration: (iteration) => {
      set((state) => {
        state.reflection.iteration = iteration;
      });
    },

    clearReflection: () => {
      set((state) => {
        state.reflection = initialReflectionState;
      });
    },

    cleanupGoalContexts: () => {
      // Clear timeout to prevent memory leaks
      clearStreamTimeout();

      set((state) => {
        // Clear execution data but preserve the goal state for UI display
        state.steps = [];
        state.terminalLogs = [];
        state.browserActions = [];
        state.currentBrowserUrl = null;
        state.currentScreenshot = null;
        state.fileChanges = [];
        state.researchTasks = {};
        state.currentLLMStream = '';
        state.isStreaming = false;
      });

      console.debug('[ExecutionStore] Cleaned up goal execution contexts');
    },

    reset: () => {
      clearStreamTimeout();
      clearGoalCleanupTimeout();
      set(initialState);
    },
  })),
);

export interface ExecutionGoalSnapshot {
  tasks: AgentTask[];
  liveStepsByTask: Record<string, AgentTaskLiveStep[]>;
  liveProgressByTask: Record<string, { step: number; total: number }>;
}

export interface IterationStartPayload {
  goal_id: string;
  iteration: number;
  has_prior_reflection?: boolean;
}

export interface IterationCompletePayload {
  goal_id: string;
  iteration: number;
  steps_succeeded: number;
  steps_failed: number;
  consecutive_failures: number;
}

export interface PlanCritiquePayload {
  goal_id: string;
  iteration: number;
  quality_score: number;
  likely_to_succeed: boolean;
  risks_count: number;
  suggestions: string[];
}

export interface PlanRevisedPayload {
  goal_id: string;
  iteration: number;
  corrections_applied: number;
}

export interface GoalUnachievablePayload {
  goal_id: string;
  iterations: number;
  consecutive_failures: number;
  final_insight: ReflectionInsight;
}

function mapGoalStatusToIterationStatus(status: ActiveGoal['status']): IterationStatus {
  switch (status) {
    case 'planning':
      return 'planning';
    case 'executing':
      return 'executing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeFailedStep(raw: unknown): FailedStep {
  const value = asRecord(raw);
  return {
    stepId: String(value['stepId'] ?? value['step_id'] ?? ''),
    toolId: String(value['toolId'] ?? value['tool_id'] ?? ''),
    description: String(value['description'] ?? ''),
    error: typeof value['error'] === 'string' ? value['error'] : undefined,
    failureCategory: String(
      value['failureCategory'] ?? value['failure_category'] ?? 'Unknown',
    ) as FailedStep['failureCategory'],
    recoverable: asBoolean(value['recoverable']),
  };
}

export function normalizeFailurePattern(raw: unknown): FailurePattern {
  const value = asRecord(raw);
  return {
    patternId: String(value['patternId'] ?? value['pattern_id'] ?? ''),
    category: String(value['category'] ?? 'Unknown') as FailurePattern['category'],
    description: String(value['description'] ?? ''),
    affectedSteps: asStringArray(value['affectedSteps'] ?? value['affected_steps']),
    rootCause:
      typeof value['rootCause'] === 'string'
        ? value['rootCause']
        : typeof value['root_cause'] === 'string'
          ? value['root_cause']
          : undefined,
    frequency: asNumber(value['frequency']),
  };
}

export function normalizeCorrection(raw: unknown): Correction {
  const value = asRecord(raw);
  return {
    forStepId: String(value['forStepId'] ?? value['for_step_id'] ?? ''),
    correctionType: String(
      value['correctionType'] ?? value['correction_type'] ?? 'Retry',
    ) as Correction['correctionType'],
    description: String(value['description'] ?? ''),
    alternativeTool:
      typeof value['alternativeTool'] === 'string'
        ? value['alternativeTool']
        : typeof value['alternative_tool'] === 'string'
          ? value['alternative_tool']
          : undefined,
    modifiedParameters:
      typeof value['modifiedParameters'] === 'object' && value['modifiedParameters'] !== null
        ? (value['modifiedParameters'] as Record<string, unknown>)
        : typeof value['modified_parameters'] === 'object' && value['modified_parameters'] !== null
          ? (value['modified_parameters'] as Record<string, unknown>)
          : undefined,
    priority: asNumber(value['priority']),
  };
}

export function normalizeSubGoal(raw: unknown): SubGoal {
  const value = asRecord(raw);
  return {
    id: String(value['id'] ?? ''),
    parentGoalId: String(value['parentGoalId'] ?? value['parent_goal_id'] ?? ''),
    fromStepId: String(value['fromStepId'] ?? value['from_step_id'] ?? ''),
    description: String(value['description'] ?? ''),
    successCriteria: asStringArray(value['successCriteria'] ?? value['success_criteria']),
    suggestedTools: asStringArray(value['suggestedTools'] ?? value['suggested_tools']),
    priority: asNumber(value['priority']),
  };
}

export function normalizeReflectionInsight(raw: unknown): ReflectionInsight {
  const value = asRecord(raw);
  const assessment = asRecord(value['assessment']);
  const rawFailedSteps = assessment['failedSteps'] ?? assessment['failed_steps'];
  const rawFailurePatterns = value['failurePatterns'] ?? value['failure_patterns'];
  const rawSubGoals = value['subGoals'] ?? value['sub_goals'];

  return {
    id: String(value['id'] ?? ''),
    goalId: String(value['goalId'] ?? value['goal_id'] ?? ''),
    assessment: {
      successRate: asNumber(assessment['successRate'] ?? assessment['success_rate']),
      successfulSteps: asStringArray(
        assessment['successfulSteps'] ?? assessment['successful_steps'],
      ),
      failedSteps: Array.isArray(rawFailedSteps)
        ? rawFailedSteps.map((step: unknown) => normalizeFailedStep(step))
        : [],
      goalAchievable: asBoolean(
        assessment['goalAchievable'] ?? assessment['goal_achievable'],
        true,
      ),
      progressEstimate: asNumber(assessment['progressEstimate'] ?? assessment['progress_estimate']),
      resourceEfficiency: asNumber(
        assessment['resourceEfficiency'] ?? assessment['resource_efficiency'],
      ),
      timeEfficiency: asNumber(assessment['timeEfficiency'] ?? assessment['time_efficiency']),
    },
    failurePatterns: Array.isArray(rawFailurePatterns)
      ? rawFailurePatterns.map((pattern: unknown) => normalizeFailurePattern(pattern))
      : [],
    corrections: Array.isArray(value['corrections'])
      ? value['corrections'].map((correction: unknown) => normalizeCorrection(correction))
      : [],
    subGoals: Array.isArray(rawSubGoals)
      ? rawSubGoals.map((subGoal: unknown) => normalizeSubGoal(subGoal))
      : [],
    recommendations: asStringArray(value['recommendations']),
    confidence: asNumber(value['confidence'], 1),
    timestamp: asNumber(value['timestamp']),
  };
}

function hasTaskLiveState(
  liveSteps: AgentTaskLiveStep[] | undefined,
  liveProgress: { step: number; total: number } | undefined,
): boolean {
  return Boolean((liveSteps && liveSteps.length > 0) || liveProgress);
}

function isActiveExecutionTask(task: AgentTask): boolean {
  return (
    task.status === 'pending' ||
    task.status === 'running' ||
    task.status === 'paused' ||
    task.status === 'recovering'
  );
}

function isTerminalExecutionTask(task: AgentTask): boolean {
  return (
    task.status === 'completed' ||
    task.status === 'failed' ||
    task.status === 'cancelled' ||
    task.status === 'expired'
  );
}

function sortTasksByRecency(left: AgentTask, right: AgentTask): number {
  const leftTime = new Date(left.completedAt ?? left.createdAt).getTime();
  const rightTime = new Date(right.completedAt ?? right.createdAt).getTime();
  return rightTime - leftTime;
}

function selectPrimaryExecutionTask(
  snapshot: ExecutionGoalSnapshot,
  currentGoalId: string | null,
): AgentTask | null {
  const { tasks, liveStepsByTask, liveProgressByTask } = snapshot;

  if (currentGoalId) {
    const currentTask = tasks.find((task) => task.id === currentGoalId);
    if (
      currentTask &&
      (isActiveExecutionTask(currentTask) ||
        hasTaskLiveState(liveStepsByTask[currentTask.id], liveProgressByTask[currentTask.id]))
    ) {
      return currentTask;
    }
  }

  const activeTask = tasks.filter(isActiveExecutionTask).sort(sortTasksByRecency)[0];
  if (activeTask) {
    return activeTask;
  }

  return (
    tasks
      .filter(
        (task) =>
          isTerminalExecutionTask(task) &&
          hasTaskLiveState(liveStepsByTask[task.id], liveProgressByTask[task.id]),
      )
      .sort(sortTasksByRecency)[0] ?? null
  );
}

function mapTaskStatusToExecutionStatus(task: AgentTask): ActiveGoal['status'] {
  switch (task.status) {
    case 'pending':
      return 'planning';
    case 'running':
    case 'paused':
    case 'recovering':
      return 'executing';
    case 'completed':
      return 'completed';
    default:
      return 'failed';
  }
}

function mapLiveStepStatus(status: AgentTaskLiveStep['status']): StepStatus {
  switch (status) {
    case 'running':
      return 'in-progress';
    case 'done':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

function buildExecutionGoal(task: AgentTask, snapshot: ExecutionGoalSnapshot): ActiveGoal {
  const liveSteps = snapshot.liveStepsByTask[task.id] ?? [];
  const liveProgress = snapshot.liveProgressByTask[task.id];
  const totalSteps = Math.max(liveProgress?.total ?? 0, liveSteps.length);
  const completedSteps =
    task.status === 'completed'
      ? totalSteps || task.iterations || 0
      : (liveProgress?.step ?? task.iterations ?? 0);
  const progressPercent =
    task.status === 'completed'
      ? 100
      : totalSteps > 0
        ? Math.min(100, Math.round((completedSteps / totalSteps) * 100))
        : 0;

  return {
    id: task.id,
    description: task.goal,
    status: mapTaskStatusToExecutionStatus(task),
    startTime: new Date(task.createdAt).getTime(),
    endTime: task.completedAt ? new Date(task.completedAt).getTime() : undefined,
    totalSteps,
    completedSteps,
    progressPercent,
  };
}

function buildExecutionSteps(
  taskId: string,
  snapshot: ExecutionGoalSnapshot,
  existingSteps: ExecutionStep[],
): ExecutionStep[] {
  const existingById = new Map(existingSteps.map((step) => [step.id, step]));
  const liveSteps = [...(snapshot.liveStepsByTask[taskId] ?? [])].sort(
    (left, right) => left.index - right.index,
  );

  return liveSteps.map((step) => {
    const existing = existingById.get(step.id);
    return {
      id: step.id,
      goalId: taskId,
      index: step.index,
      description: step.description,
      status: mapLiveStepStatus(step.status),
      startTime: step.startedAt?.getTime(),
      endTime: step.completedAt?.getTime(),
      executionTimeMs: step.executionTimeMs,
      error: step.error,
      llmReasoning: existing?.llmReasoning,
    };
  });
}

export function syncExecutionGoalFromAgentTasks(snapshot: ExecutionGoalSnapshot): void {
  const currentState = useExecutionStore.getState();
  const previousGoal = currentState.activeGoal;
  const primaryTask = selectPrimaryExecutionTask(snapshot, previousGoal?.id ?? null);

  if (!primaryTask) {
    clearGoalCleanupTimeout();
    useExecutionStore.setState({
      activeGoal: null,
      steps: [],
      iterationProgress: initialIterationProgressState,
    });
    return;
  }

  const nextGoal = buildExecutionGoal(primaryTask, snapshot);
  const nextSteps = buildExecutionSteps(primaryTask.id, snapshot, currentState.steps);
  const nextIterationProgress =
    currentState.iterationProgress.goalId === nextGoal.id
      ? {
          ...currentState.iterationProgress,
          status:
            nextGoal.status === 'completed' || nextGoal.status === 'failed'
              ? mapGoalStatusToIterationStatus(nextGoal.status)
              : currentState.iterationProgress.status === 'idle'
                ? mapGoalStatusToIterationStatus(nextGoal.status)
                : currentState.iterationProgress.status,
          startTime: currentState.iterationProgress.startTime ?? nextGoal.startTime,
        }
      : {
          ...initialIterationProgressState,
          goalId: nextGoal.id,
          status: mapGoalStatusToIterationStatus(nextGoal.status),
          startTime: nextGoal.startTime,
        };

  useExecutionStore.setState({
    activeGoal: nextGoal,
    steps: nextSteps,
    iterationProgress: nextIterationProgress,
  });

  const wasTerminal = previousGoal?.status === 'completed' || previousGoal?.status === 'failed';
  const isTerminal = nextGoal.status === 'completed' || nextGoal.status === 'failed';

  if (isTerminal && (!previousGoal || previousGoal.id !== nextGoal.id || !wasTerminal)) {
    clearGoalCleanupTimeout();
    goalCleanupTimeoutHandle = setTimeout(() => {
      useExecutionStore.getState().cleanupGoalContexts();
      goalCleanupTimeoutHandle = null;
    }, 5000);
  } else if (!isTerminal) {
    clearGoalCleanupTimeout();
  }
}

export function applyIterationProgressStart(payload: IterationStartPayload): void {
  useExecutionStore.setState((state) => ({
    iterationProgress: {
      ...(state.iterationProgress.goalId === payload.goal_id
        ? state.iterationProgress
        : initialIterationProgressState),
      goalId: payload.goal_id,
      status: 'executing',
      currentIteration: payload.iteration,
      hasPriorReflection: payload.has_prior_reflection === true,
      startTime:
        state.iterationProgress.goalId === payload.goal_id && state.iterationProgress.startTime
          ? state.iterationProgress.startTime
          : Date.now(),
    },
  }));
}

export function applyIterationProgressComplete(payload: IterationCompletePayload): void {
  useExecutionStore.setState((state) => ({
    iterationProgress: {
      ...(state.iterationProgress.goalId === payload.goal_id
        ? state.iterationProgress
        : initialIterationProgressState),
      goalId: payload.goal_id,
      status: 'reflecting',
      currentIteration: payload.iteration,
      consecutiveFailures: payload.consecutive_failures,
      history: [
        ...state.iterationProgress.history.filter((entry) => entry.iteration !== payload.iteration),
        {
          iteration: payload.iteration,
          stepsSucceeded: payload.steps_succeeded,
          stepsFailed: payload.steps_failed,
          consecutiveFailures: payload.consecutive_failures,
          timestamp: Date.now(),
        },
      ].sort((left, right) => left.iteration - right.iteration),
      startTime: state.iterationProgress.startTime ?? Date.now(),
    },
  }));
}

export function applyIterationPlanCritique(payload: PlanCritiquePayload): void {
  useExecutionStore.setState((state) => ({
    iterationProgress: {
      ...(state.iterationProgress.goalId === payload.goal_id
        ? state.iterationProgress
        : initialIterationProgressState),
      goalId: payload.goal_id,
      status: 'planning',
      currentIteration: payload.iteration,
      planCritique: {
        iteration: payload.iteration,
        qualityScore: payload.quality_score,
        likelyToSucceed: payload.likely_to_succeed,
        risksCount: payload.risks_count,
        suggestions: payload.suggestions,
      },
      startTime: state.iterationProgress.startTime ?? Date.now(),
    },
  }));
}

export function applyIterationPlanRevised(payload: PlanRevisedPayload): void {
  useExecutionStore.setState((state) => ({
    iterationProgress: {
      ...(state.iterationProgress.goalId === payload.goal_id
        ? state.iterationProgress
        : initialIterationProgressState),
      goalId: payload.goal_id,
      status: 'executing',
      currentIteration: payload.iteration,
      startTime: state.iterationProgress.startTime ?? Date.now(),
    },
  }));
}

export function applyIterationGoalUnachievable(payload: GoalUnachievablePayload): void {
  useExecutionStore.setState((state) => ({
    iterationProgress: {
      ...(state.iterationProgress.goalId === payload.goal_id
        ? state.iterationProgress
        : initialIterationProgressState),
      goalId: payload.goal_id,
      status: 'failed',
      currentIteration: payload.iterations,
      consecutiveFailures: payload.consecutive_failures,
      startTime: state.iterationProgress.startTime ?? Date.now(),
    },
  }));
}

let listenersInitialized = false;
// AUDIT-006-028 fix: Store unlisten functions for cleanup
type UnlistenFn = () => void;
const unlistenFunctions: UnlistenFn[] = [];
let executionGoalSubscriptionInitialized = false;
let executionGoalUnsubscribe: (() => void) | null = null;

/**
 * AUDIT-006-028 fix: Cleanup function to remove all event listeners
 * Call this during logout to prevent memory leaks
 */
export function cleanupExecutionListeners(): void {
  for (const unlisten of unlistenFunctions) {
    try {
      unlisten();
    } catch (error) {
      console.error('[ExecutionStore] Error cleaning up listener:', error);
    }
  }
  unlistenFunctions.length = 0;
  listenersInitialized = false;
  executionGoalUnsubscribe?.();
  executionGoalUnsubscribe = null;
  executionGoalSubscriptionInitialized = false;
  clearGoalCleanupTimeout();
  console.debug('[ExecutionStore] Event listeners cleaned up');
}

export function initializeExecutionGoalSubscription(): void {
  if (executionGoalSubscriptionInitialized) {
    return;
  }

  executionGoalSubscriptionInitialized = true;

  executionGoalUnsubscribe = useAgentTaskStore.subscribe((state) => {
    syncExecutionGoalFromAgentTasks({
      tasks: state.tasks,
      liveStepsByTask: state.liveStepsByTask,
      liveProgressByTask: state.liveProgressByTask,
    });
  });

  syncExecutionGoalFromAgentTasks({
    tasks: useAgentTaskStore.getState().tasks,
    liveStepsByTask: useAgentTaskStore.getState().liveStepsByTask,
    liveProgressByTask: useAgentTaskStore.getState().liveProgressByTask,
  });
}

export async function initializeExecutionListeners() {
  if (listenersInitialized) {
    return;
  }
  listenersInitialized = true;

  // Skip listener setup in web mode
  if (!isTauri) {
    console.debug('[ExecutionStore] Skipping event listeners in web mode');
    return;
  }

  try {
    const unlisten8 = await listen<{ step_id: string; chunk: string }>(
      'agi:llm_chunk',
      ({ payload }) => {
        const state = useExecutionStore.getState();
        state.appendLLMReasoning(payload.step_id, payload.chunk);
        state.setStreaming(true);
      },
    );
    unlistenFunctions.push(unlisten8);

    const unlisten9 = await listen<{ step_id: string }>('agi:llm_complete', () => {
      useExecutionStore.getState().setStreaming(false);
    });
    unlistenFunctions.push(unlisten9);

    const unlisten10 = await listen<{ command: string; output: string; exit_code?: number }>(
      'agi:terminal_output',
      ({ payload }) => {
        useExecutionStore.getState().addTerminalLog({
          id: `terminal_${Date.now()}`,
          timestamp: Date.now(),
          command: payload.command,
          output: payload.output,
          exitCode: payload.exit_code,
          isError: payload.exit_code !== undefined && payload.exit_code !== 0,
        });
      },
    );
    unlistenFunctions.push(unlisten10);

    const unlisten11 = await listen<{
      type: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot';
      url?: string;
      selector?: string;
      value?: string;
      screenshot_base64?: string;
      success: boolean;
      error?: string;
    }>('agi:browser_action', async ({ payload }) => {
      const state = useExecutionStore.getState();
      const actionId = `browser_${Date.now()}`;
      const timestamp = Date.now();

      state.addBrowserAction({
        id: actionId,
        timestamp,
        type: payload.type,
        url: payload.url,
        selector: payload.selector,
        value: payload.value,
        screenshotData: payload.screenshot_base64,
        success: payload.success,
        error: payload.error,
      });

      if (payload.url) {
        state.updateCurrentBrowserState(payload.url, payload.screenshot_base64 || null);
      }

      // WRK-003: Sync with browserStore to keep inline panels in sync with workspace
      try {
        const browserStore = useBrowserStore.getState();

        // Add action to browserStore in its expected format
        browserStore.addAction({
          id: actionId,
          type: payload.type as ActionType,
          timestamp,
          success: payload.success,
          details: {
            url: payload.url,
            selector: payload.selector,
            text: payload.value,
            error: payload.error,
          },
        });

        // Add screenshot if present
        if (payload.screenshot_base64 && browserStore.sessions.length > 0) {
          const activeSession = browserStore.sessions.find((s) => s.active);
          const activeTab = activeSession?.tabs.find((t) => t.active);
          if (activeTab) {
            browserStore.addScreenshot({
              id: `screenshot_${timestamp}`,
              timestamp,
              data: payload.screenshot_base64,
              tabId: activeTab.id,
            });
          }
        }
      } catch (syncError) {
        // Don't block execution if browserStore sync fails
        console.debug('[ExecutionStore] browserStore sync skipped:', syncError);
      }
    });
    unlistenFunctions.push(unlisten11);

    const unlisten12 = await listen<{
      path: string;
      operation: 'create' | 'modify' | 'delete';
      old_content?: string;
      new_content?: string;
      language?: string;
    }>('agi:file_changed', ({ payload }) => {
      useExecutionStore.getState().addFileChange({
        id: `file_${Date.now()}`,
        timestamp: Date.now(),
        path: payload.path,
        operation: payload.operation,
        oldContent: payload.old_content,
        newContent: payload.new_content,
        language: payload.language,
        accepted: null,
      });
    });
    unlistenFunctions.push(unlisten12);

    // ===== Reflection Events =====

    // Main reflection completed event with full insight
    const unlisten13 = await listen<{
      goal_id: string;
      iteration: number;
      insight: ReflectionInsight;
    }>('agi:reflection:completed', ({ payload }) => {
      const state = useExecutionStore.getState();
      state.setReflectionInsight(normalizeReflectionInsight(payload.insight));
      state.setIteration(payload.iteration);
      state.setReflecting(false);

      // Switch to reflection tab when there are issues
      if (payload.insight.assessment.successRate < 1.0) {
        state.setActiveTab('reflection');
      }
    });
    unlistenFunctions.push(unlisten13);

    // Failure patterns event
    const unlisten14 = await listen<{
      goal_id: string;
      iteration: number;
      patterns: FailurePattern[];
    }>('agi:reflection:failure_patterns', ({ payload }) => {
      const state = useExecutionStore.getState();
      payload.patterns.forEach((pattern) => {
        state.addFailurePattern(normalizeFailurePattern(pattern));
      });
    });
    unlistenFunctions.push(unlisten14);

    // Corrections event
    const unlisten15 = await listen<{
      goal_id: string;
      iteration: number;
      corrections: Correction[];
    }>('agi:reflection:corrections', ({ payload }) => {
      useExecutionStore
        .getState()
        .setCorrections(payload.corrections.map((correction) => normalizeCorrection(correction)));
    });
    unlistenFunctions.push(unlisten15);

    // Recommendations event
    const unlisten16 = await listen<{
      goal_id: string;
      iteration: number;
      recommendations: string[];
    }>('agi:reflection:recommendations', ({ payload }) => {
      useExecutionStore.getState().setRecommendations(payload.recommendations);
    });
    unlistenFunctions.push(unlisten16);

    // Sub-goals event
    const unlisten17 = await listen<{
      goal_id: string;
      sub_goals: SubGoal[];
    }>('agi:reflection:sub_goals', ({ payload }) => {
      useExecutionStore
        .getState()
        .setSubGoals(payload.sub_goals.map((subGoal) => normalizeSubGoal(subGoal)));
    });
    unlistenFunctions.push(unlisten17);

    // Plan revised event (after corrections applied)
    const unlisten18 = await listen<PlanRevisedPayload>(
      'agi:reflection:plan_revised',
      ({ payload }) => {
        applyIterationPlanRevised(payload);
        console.debug(
          `[ExecutionStore] Plan revised: ${payload.corrections_applied} corrections applied`,
        );
      },
    );
    unlistenFunctions.push(unlisten18);

    // Goal iteration start - set reflecting state
    const unlisten19 = await listen<IterationStartPayload>(
      'agi:goal:iteration_start',
      ({ payload }) => {
        applyIterationProgressStart(payload);
        const state = useExecutionStore.getState();
        state.setIteration(payload.iteration);
        // Will be set to reflecting once actual reflection begins
      },
    );
    unlistenFunctions.push(unlisten19);

    // Goal unachievable event
    const unlisten20 = await listen<GoalUnachievablePayload>(
      'agi:goal:unachievable',
      ({ payload }) => {
        applyIterationGoalUnachievable(payload);
        const state = useExecutionStore.getState();
        state.setReflectionInsight(normalizeReflectionInsight(payload.final_insight));
        // Switch to reflection tab to show the final analysis
        state.setActiveTab('reflection');
      },
    );
    unlistenFunctions.push(unlisten20);

    const unlisten21 = await listen<IterationCompletePayload>(
      'agi:goal:iteration_complete',
      ({ payload }) => {
        applyIterationProgressComplete(payload);
      },
    );
    unlistenFunctions.push(unlisten21);

    const unlisten22 = await listen<PlanCritiquePayload>(
      'agi:reflection:plan_critique',
      ({ payload }) => {
        applyIterationPlanCritique(payload);
      },
    );
    unlistenFunctions.push(unlisten22);
  } catch (error) {
    console.error('[ExecutionStore] Failed to initialize event listeners:', error);
    listenersInitialized = false;
  }
}

export const selectActiveGoal = (state: ExecutionState) => state.activeGoal;
export const selectSteps = (state: ExecutionState) => state.steps;
export const selectTerminalLogs = (state: ExecutionState) => state.terminalLogs;
export const selectBrowserActions = (state: ExecutionState) => state.browserActions;
export const selectFileChanges = (state: ExecutionState) => state.fileChanges;
export const selectPanelVisible = (state: ExecutionState) => state.panelVisible;
export const selectActiveTab = (state: ExecutionState) => state.activeTab;
export const selectCurrentScreenshot = (state: ExecutionState) => state.currentScreenshot;
export const selectCurrentBrowserUrl = (state: ExecutionState) => state.currentBrowserUrl;
export const selectIsStreaming = (state: ExecutionState) => state.isStreaming;
export const selectIterationProgress = (state: ExecutionState) => state.iterationProgress;

export const selectPendingFileChanges = (state: ExecutionState) =>
  state.fileChanges.filter((c) => c.accepted === null);

export const selectActiveStep = (state: ExecutionState) =>
  state.steps.find((s) => s.status === 'in-progress');

// Reflection selectors
export const selectReflection = (state: ExecutionState) => state.reflection;
export const selectReflectionInsight = (state: ExecutionState) => state.reflection.currentInsight;
export const selectFailurePatterns = (state: ExecutionState) => state.reflection.failurePatterns;
export const selectCorrections = (state: ExecutionState) => state.reflection.corrections;
export const selectSubGoals = (state: ExecutionState) => state.reflection.subGoals;
export const selectRecommendations = (state: ExecutionState) => state.reflection.recommendations;
export const selectIsReflecting = (state: ExecutionState) => state.reflection.isReflecting;
export const selectReflectionIteration = (state: ExecutionState) => state.reflection.iteration;
export const selectGoalAchievable = (state: ExecutionState) => state.reflection.goalAchievable;
export const selectConfidence = (state: ExecutionState) => state.reflection.confidence;

/** Check if there are any reflection issues to display */
export const selectHasReflectionIssues = (state: ExecutionState) =>
  state.reflection.failurePatterns.length > 0 ||
  state.reflection.corrections.length > 0 ||
  !state.reflection.goalAchievable;

/** Get the total count of issues for badge display */
export const selectReflectionIssueCount = (state: ExecutionState) =>
  state.reflection.failurePatterns.length +
  state.reflection.corrections.length +
  (state.reflection.goalAchievable ? 0 : 1);
