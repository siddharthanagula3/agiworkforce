import { listen, isTauri } from '../lib/tauri-mock';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ResearchTask } from '../types/chat';

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
  activeTab: 'thinking' | 'terminal' | 'browser' | 'files';
  panelState: Record<string, PanelState>;

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

  /** Clean up execution contexts for a completed or failed goal (keeps goal state for UI display) */
  cleanupGoalContexts: () => void;

  reset: () => void;
}

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
  },
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
    await listen<{ goal_id: string; description: string }>('agi:goal:submitted', ({ payload }) => {
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
    });

    await listen<{ goal_id: string; total_steps: number; estimated_duration_ms: number }>(
      'agi:goal:plan_created',
      ({ payload }) => {
        const state = useExecutionStore.getState();
        const goal = state.activeGoal;
        if (goal && goal.id === payload.goal_id) {
          state.setActiveGoal({
            ...goal,
            status: 'executing',
            totalSteps: payload.total_steps,
          });
        }
      },
    );

    await listen<{
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

    await listen<{
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

    await listen<{
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

    await listen<{ goal_id: string; total_steps: number; completed_steps: number }>(
      'agi:goal:achieved',
      ({ payload }) => {
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
      },
    );

    await listen<{ goal_id: string; error: string }>('agi:goal:error', ({ payload }) => {
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
    });

    await listen<{ step_id: string; chunk: string }>('agi:llm_chunk', ({ payload }) => {
      const state = useExecutionStore.getState();
      state.appendLLMReasoning(payload.step_id, payload.chunk);
      state.setStreaming(true);
    });

    await listen<{ step_id: string }>('agi:llm_complete', () => {
      useExecutionStore.getState().setStreaming(false);
    });

    await listen<{ command: string; output: string; exit_code?: number }>(
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

    await listen<{
      type: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot';
      url?: string;
      selector?: string;
      value?: string;
      screenshot_base64?: string;
      success: boolean;
      error?: string;
    }>('agi:browser_action', ({ payload }) => {
      const state = useExecutionStore.getState();
      state.addBrowserAction({
        id: `browser_${Date.now()}`,
        timestamp: Date.now(),
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
    });

    await listen<{
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
