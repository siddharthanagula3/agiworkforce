import { listen, isTauri } from '../lib/tauri-mock';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ResearchTask } from '../types/chat';
import type { ReflectionInsight, FailurePattern, Correction, SubGoal } from '../api/reflection';
import type { ActionType } from './browserStore';
import { useBrowserStore } from './browserStore';

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
};

// Stream timeout management
let streamTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
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
      set(initialState);
    },
  })),
);

let listenersInitialized = false;
// AUDIT-006-028 fix: Store unlisten functions for cleanup
type UnlistenFn = () => void;
const unlistenFunctions: UnlistenFn[] = [];

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
  console.debug('[ExecutionStore] Event listeners cleaned up');
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
    const unlisten1 = await listen<{ goal_id: string; description: string }>(
      'agi:goal:submitted',
      ({ payload }) => {
        useExecutionStore.getState().setActiveGoal({
          id: payload.goal_id,
          description: payload.description,
          status: 'planning',
          startTime: Date.now(),
          totalSteps: 0,
          completedSteps: 0,
          progressPercent: 0,
        });
        useExecutionStore.getState().setPanelVisible(true);
      },
    );
    unlistenFunctions.push(unlisten1);

    const unlisten2 = await listen<{
      goal_id: string;
      total_steps: number;
      estimated_duration_ms: number;
    }>('agi:goal:plan_created', ({ payload }) => {
      const state = useExecutionStore.getState();
      const goal = state.activeGoal;
      if (goal && goal.id === payload.goal_id) {
        state.setActiveGoal({
          ...goal,
          status: 'executing',
          totalSteps: payload.total_steps,
        });
      }
    });
    unlistenFunctions.push(unlisten2);

    const unlisten3 = await listen<{
      goal_id: string;
      step_id: string;
      step_index: number;
      total_steps: number;
      description: string;
    }>('agi:goal:step_started', ({ payload }) => {
      const state = useExecutionStore.getState();
      state.addStep({
        id: payload.step_id,
        goalId: payload.goal_id,
        index: payload.step_index,
        description: payload.description,
        status: 'in-progress',
        startTime: Date.now(),
      });
    });
    unlistenFunctions.push(unlisten3);

    const unlisten4 = await listen<{
      goal_id: string;
      step_id: string;
      step_index: number;
      total_steps: number;
      success: boolean;
      execution_time_ms: number;
      error?: string;
    }>('agi:goal:step_completed', ({ payload }) => {
      const state = useExecutionStore.getState();
      state.updateStep(payload.step_id, {
        status: payload.success ? 'completed' : 'failed',
        endTime: Date.now(),
        executionTimeMs: payload.execution_time_ms,
        error: payload.error,
      });
    });
    unlistenFunctions.push(unlisten4);

    const unlisten5 = await listen<{
      goal_id: string;
      completed_steps: number;
      total_steps: number;
      progress_percent: number;
    }>('agi:goal:progress', ({ payload }) => {
      const state = useExecutionStore.getState();
      const goal = state.activeGoal;
      if (goal && goal.id === payload.goal_id) {
        state.setActiveGoal({
          ...goal,
          completedSteps: payload.completed_steps,
          totalSteps: payload.total_steps,
          progressPercent: payload.progress_percent,
        });
      }
    });
    unlistenFunctions.push(unlisten5);

    const unlisten6 = await listen<{
      goal_id: string;
      total_steps: number;
      completed_steps: number;
    }>('agi:goal:achieved', ({ payload }) => {
      const state = useExecutionStore.getState();
      const goal = state.activeGoal;
      if (goal && goal.id === payload.goal_id) {
        state.setActiveGoal({
          ...goal,
          status: 'completed',
          endTime: Date.now(),
          completedSteps: payload.completed_steps,
          progressPercent: 100,
        });

        // Cleanup execution contexts after a delay to allow UI to show completion
        setTimeout(() => {
          useExecutionStore.getState().cleanupGoalContexts();
        }, 5000); // 5 second delay before cleanup
      }
    });
    unlistenFunctions.push(unlisten6);

    const unlisten7 = await listen<{ goal_id: string; error: string }>(
      'agi:goal:error',
      ({ payload }) => {
        const state = useExecutionStore.getState();
        const goal = state.activeGoal;
        if (goal && goal.id === payload.goal_id) {
          state.setActiveGoal({
            ...goal,
            status: 'failed',
            endTime: Date.now(),
          });

          // Cleanup execution contexts after a delay to allow UI to show error
          setTimeout(() => {
            useExecutionStore.getState().cleanupGoalContexts();
          }, 5000); // 5 second delay before cleanup
        }
      },
    );
    unlistenFunctions.push(unlisten7);

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
      state.setReflectionInsight(payload.insight);
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
        state.addFailurePattern(pattern);
      });
    });
    unlistenFunctions.push(unlisten14);

    // Corrections event
    const unlisten15 = await listen<{
      goal_id: string;
      iteration: number;
      corrections: Correction[];
    }>('agi:reflection:corrections', ({ payload }) => {
      useExecutionStore.getState().setCorrections(payload.corrections);
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
      useExecutionStore.getState().setSubGoals(payload.sub_goals);
    });
    unlistenFunctions.push(unlisten17);

    // Plan revised event (after corrections applied)
    const unlisten18 = await listen<{
      goal_id: string;
      iteration: number;
      corrections_applied: number;
      new_steps_count: number;
    }>('agi:reflection:plan_revised', ({ payload }) => {
      console.debug(
        `[ExecutionStore] Plan revised: ${payload.corrections_applied} corrections applied, ${payload.new_steps_count} new steps`,
      );
    });
    unlistenFunctions.push(unlisten18);

    // Goal iteration start - set reflecting state
    const unlisten19 = await listen<{
      goal_id: string;
      iteration: number;
    }>('agi:goal:iteration_start', ({ payload }) => {
      const state = useExecutionStore.getState();
      state.setIteration(payload.iteration);
      // Will be set to reflecting once actual reflection begins
    });
    unlistenFunctions.push(unlisten19);

    // Goal unachievable event
    const unlisten20 = await listen<{
      goal_id: string;
      iterations: number;
      consecutive_failures: number;
      final_insight: ReflectionInsight;
    }>('agi:goal:unachievable', ({ payload }) => {
      const state = useExecutionStore.getState();
      state.setReflectionInsight(payload.final_insight);
      // Switch to reflection tab to show the final analysis
      state.setActiveTab('reflection');
    });
    unlistenFunctions.push(unlisten20);
  } catch (error) {
    console.error('[ExecutionStore] Failed to initialize event listeners:', error);
    listenersInitialized = false;
  }
}

if (typeof window !== 'undefined') {
  void initializeExecutionListeners();
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
