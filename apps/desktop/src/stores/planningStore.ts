/**
 * Planning Store
 *
 * Zustand store for managing interactive plan preview state.
 * Tracks plan generation, step review, and execution lifecycle.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { TaskStep, PlanPreviewResponse, PlanExecuteResponse } from '../api/planning';
import { previewPlan, executePlan } from '../api/planning';

export type PlanPhase = 'idle' | 'generating' | 'previewing' | 'executing' | 'done' | 'error';

export interface PlanState {
  /** Current phase of the planning lifecycle */
  phase: PlanPhase;
  /** The task description that generated the plan */
  description: string;
  /** Current plan steps (editable in preview phase) */
  steps: TaskStep[];
  /** Error message if generation or execution failed */
  error: string | null;
  /** Task ID returned after execution starts */
  taskId: string | null;
  /** Whether the planning panel is visible */
  isOpen: boolean;
}

export interface PlanActions {
  /** Open the planning panel, optionally with a pre-filled description */
  openPanel: (description?: string) => void;
  /** Close the planning panel and reset state */
  closePanel: () => void;
  /** Generate a plan from a description */
  generatePlan: (description: string) => Promise<void>;
  /** Approve the current plan and start execution */
  approvePlan: (autoApprove?: boolean) => Promise<void>;
  /** Reject the current plan and go back to idle */
  rejectPlan: () => void;
  /** Update the description text */
  setDescription: (description: string) => void;
  /** Replace a step's description */
  modifyStep: (stepId: string, newDescription: string) => void;
  /** Remove a step from the plan */
  removeStep: (stepId: string) => void;
  /** Reorder a step (move from one index to another) */
  moveStep: (fromIndex: number, toIndex: number) => void;
  /** Add a new empty step */
  addStep: () => void;
  /** Reset all state */
  reset: () => void;
}

const initialState: PlanState = {
  phase: 'idle',
  description: '',
  steps: [],
  error: null,
  taskId: null,
  isOpen: false,
};

export const usePlanningStore = create<PlanState & PlanActions>()(
  immer((set, get) => ({
    ...initialState,

    openPanel: (description?: string) => {
      set((state) => {
        state.isOpen = true;
        state.phase = 'idle';
        state.error = null;
        if (description) {
          state.description = description;
        }
      });
      // If a description was provided, auto-generate the plan
      if (description?.trim()) {
        get().generatePlan(description);
      }
    },

    closePanel: () => {
      set((state) => {
        state.isOpen = false;
        state.phase = 'idle';
        state.description = '';
        state.steps = [];
        state.error = null;
        state.taskId = null;
      });
    },

    generatePlan: async (description: string) => {
      set((state) => {
        state.description = description;
        state.phase = 'generating';
        state.error = null;
        state.steps = [];
      });

      try {
        const result: PlanPreviewResponse = await previewPlan(description);
        set((state) => {
          state.steps = result.steps;
          state.phase = 'previewing';
        });
      } catch (err) {
        set((state) => {
          state.error = err instanceof Error ? err.message : String(err);
          state.phase = 'error';
        });
      }
    },

    approvePlan: async (autoApprove?: boolean) => {
      const { description, steps } = get();
      if (steps.length === 0) return;

      set((state) => {
        state.phase = 'executing';
        state.error = null;
      });

      try {
        const result: PlanExecuteResponse = await executePlan(description, steps, autoApprove);
        set((state) => {
          state.taskId = result.taskId;
          state.phase = 'done';
        });
      } catch (err) {
        set((state) => {
          state.error = err instanceof Error ? err.message : String(err);
          state.phase = 'error';
        });
      }
    },

    rejectPlan: () => {
      set((state) => {
        state.phase = 'idle';
        state.steps = [];
        state.error = null;
      });
    },

    setDescription: (description: string) => {
      set((state) => {
        state.description = description;
      });
    },

    modifyStep: (stepId: string, newDescription: string) => {
      set((state) => {
        const step = state.steps.find((s) => s.id === stepId);
        if (step) {
          step.description = newDescription;
        }
      });
    },

    removeStep: (stepId: string) => {
      set((state) => {
        state.steps = state.steps.filter((s) => s.id !== stepId);
      });
    },

    moveStep: (fromIndex: number, toIndex: number) => {
      set((state) => {
        if (toIndex < 0 || toIndex >= state.steps.length) return;
        const [moved] = state.steps.splice(fromIndex, 1);
        if (moved) {
          state.steps.splice(toIndex, 0, moved);
        }
      });
    },

    addStep: () => {
      set((state) => {
        state.steps.push({
          id: `step_${Date.now()}_${state.steps.length + 1}`,
          action: { type: 'screenshot' },
          description: 'New step',
          timeout: 10,
          retryOnFailure: false,
        });
      });
    },

    reset: () => {
      set(() => ({ ...initialState }));
    },
  })),
);

/** Selector: is the planning panel currently visible */
export const selectPlanningOpen = (state: PlanState & PlanActions) => state.isOpen;

/** Selector: current plan phase */
export const selectPlanPhase = (state: PlanState & PlanActions) => state.phase;

/** Selector: current plan steps */
export const selectPlanSteps = (state: PlanState & PlanActions) => state.steps;
