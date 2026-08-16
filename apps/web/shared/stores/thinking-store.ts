import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Effort } from '@agiworkforce/types';

export type EffortLevel = Effort;

const EFFORT_CYCLE: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

interface ThinkingState {
  enabled: boolean;
  effort: EffortLevel;
}

interface ThinkingActions {
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
  setEffort: (level: EffortLevel) => void;
  cycleEffort: () => void;
}

export type ThinkingStore = ThinkingState & ThinkingActions;

export const useThinkingStore = create<ThinkingStore>()(
  devtools(
    persist(
      immer<ThinkingStore>((set) => ({
        enabled: false,
        effort: 'medium',

        setEnabled: (enabled) =>
          set((state) => {
            state.enabled = enabled;
          }),

        toggle: () =>
          set((state) => {
            if (!state.enabled) {
              state.enabled = true;
              state.effort = 'low';
            } else {
              state.enabled = false;
            }
          }),

        setEffort: (level) =>
          set((state) => {
            state.effort = level;
            state.enabled = true;
          }),

        cycleEffort: () =>
          set((state) => {
            if (!state.enabled) {
              state.enabled = true;
              state.effort = 'low';
              return;
            }
            const currentIndex = EFFORT_CYCLE.indexOf(state.effort);
            const nextIndex = currentIndex + 1;
            if (nextIndex >= EFFORT_CYCLE.length) {
              state.enabled = false;
            } else {
              state.effort = EFFORT_CYCLE[nextIndex]!;
            }
          }),
      })),
      {
        name: 'agi-thinking-store',
        storage: createJSONStorage(() => {
          if (typeof window === 'undefined') {
            return {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            };
          }
          return localStorage;
        }),
      },
    ),
    { name: 'ThinkingStore', enabled: process.env.NODE_ENV !== 'production' },
  ),
);

export const selectThinkingEnabled = (state: ThinkingStore) => state.enabled;
export const selectEffortLevel = (state: ThinkingStore) => state.effort;
