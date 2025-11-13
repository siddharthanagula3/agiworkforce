/**
 * Execution Dashboard Store
 *
 * Manages state for the visual execution dashboard including:
 * - AGI planning and execution steps
 * - Terminal command output
 * - Browser automation actions
 * - File changes and diffs
 * - LLM reasoning streams
 */

import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { immer } from 'zustand/middleware/immer';

// ========================================
// Types
// ========================================

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
  llmReasoning?: string; // Streaming LLM reasoning output
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
  screenshotData?: string; // Base64 encoded image
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
  accepted: boolean | null; // null = pending, true = accepted, false = rejected
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
  size: number; // Percentage of screen
}

export interface ExecutionState {
  // Active goals and steps
  activeGoal: ActiveGoal | null;
  steps: ExecutionStep[];

  // Terminal output
  terminalLogs: TerminalLog[];
  terminalScrollLock: boolean;

  // Browser automation
  browserActions: BrowserAction[];
  currentBrowserUrl: string | null;
  currentScreenshot: string | null;

  // File changes
  fileChanges: FileChange[];

  // LLM streaming
  currentLLMStream: string;
  isStreaming: boolean;

  // Panel visibility
  panelVisible: boolean;
  activeTab: 'thinking' | 'terminal' | 'browser' | 'files';
  panelState: Record<string, PanelState>;

  // Actions
  setActiveGoal: (goal: ActiveGoal | null) => void;
  addStep: (step: ExecutionStep) => void;
  updateStep: (stepId: string, updates: Partial<ExecutionStep>) => void;
  appendLLMReasoning: (stepId: string, chunk: string) => void;

  addTerminalLog: (log: TerminalLog) => void;
  clearTerminalLogs: () => void;
  setTerminalScrollLock: (locked: boolean) => void;

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

  reset: () => void;
}

// ========================================
// Store
// ========================================

const initialState = {
  activeGoal: null,
  steps: [],
  terminalLogs: [],
  terminalScrollLock: false,
  browserActions: [],
  currentBrowserUrl: null,
  currentScreenshot: null,
  fileChanges: [],
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
        // Keep last 1000 logs
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

    addBrowserAction: (action) => {
      set((state) => {
        state.browserActions.push(action);
        // Keep last 100 actions
        if (state.browserActions.length > 100) {
          state.browserActions = state.browserActions.slice(-100);
        }
        // Update current screenshot if this action has one
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

    reset: () => {
      set(initialState);
    },
  })),
);

// ========================================
// Event Listeners
// ========================================

let listenersInitialized = false;

export async function initializeExecutionListeners() {
  if (listenersInitialized) {
    return;
  }
  listenersInitialized = true;

  try {
    // AGI Goal Events
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
      }
    });

    // LLM Streaming Events
    await listen<{ step_id: string; chunk: string }>('agi:llm_chunk', ({ payload }) => {
      const state = useExecutionStore.getState();
      state.appendLLMReasoning(payload.step_id, payload.chunk);
      state.setStreaming(true);
    });

    await listen<{ step_id: string }>('agi:llm_complete', () => {
      useExecutionStore.getState().setStreaming(false);
    });

    // Terminal Events
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

    // Browser Events
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

    // File Events
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

    console.log('[ExecutionStore] Event listeners initialized');
  } catch (error) {
    console.error('[ExecutionStore] Failed to initialize event listeners:', error);
    listenersInitialized = false;
  }
}

// Initialize listeners in browser environment
if (typeof window !== 'undefined') {
  void initializeExecutionListeners();
}

// ========================================
// Selectors
// ========================================

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
