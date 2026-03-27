import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { ResearchTask } from '@/types/chat';

interface ExecutionState {
  researchTasks: Record<string, ResearchTask>;
  addResearchTask: (task: ResearchTask) => void;
  updateResearchTask: (id: string, updates: Partial<ResearchTask>) => void;
  reset: () => void;
}

export const useExecutionStore = create<ExecutionState>()(
  immer((set) => ({
    researchTasks: {},

    addResearchTask: (task) =>
      set((state) => {
        state.researchTasks[task.id] = task;
      }),

    updateResearchTask: (id, updates) =>
      set((state) => {
        if (!state.researchTasks[id]) {
          return;
        }
        Object.assign(state.researchTasks[id]!, updates);
      }),

    reset: () =>
      set((state) => {
        state.researchTasks = {};
      }),
  })),
);

export type { ExecutionState };
