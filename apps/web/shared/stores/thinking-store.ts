/**
 * Thinking Store (web surface)
 *
 * Zustand store for managing effort/thinking control in the web chat composer.
 * State is persisted to localStorage so the user's preference survives refresh.
 *
 * Effort cycle (programmatic): off -> low -> medium -> high -> max -> off
 * UI pill click when disabled: enables at 'medium'
 * UI pill click when enabled: cycles to next level (max -> off)
 */
import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

const EFFORT_CYCLE: EffortLevel[] = ['low', 'medium', 'high', 'max'];

interface ThinkingState {
  enabled: boolean;
  effort: EffortLevel;
}

interface ThinkingActions {
  /** Enable at 'medium' if disabled; disable if enabled. */
  toggle: () => void;
  /** Set effort level explicitly; also enables the store if disabled. */
  setEffort: (level: EffortLevel) => void;
  /**
   * Programmatic cycle: off -> low -> medium -> high -> max -> off.
   * UI pill uses toggle() and cycleEffort() separately (never cycles from off via pill).
   */
  cycleEffort: () => void;
}

export type ThinkingStore = ThinkingState & ThinkingActions;

export const useThinkingStore = create<ThinkingStore>()(
  devtools(
    persist(
      immer<ThinkingStore>((set) => ({
        // Default state
        enabled: false,
        effort: 'medium',

        toggle: () =>
          set((state) => {
            if (!state.enabled) {
              state.enabled = true;
              state.effort = 'medium';
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
              // off -> low
              state.enabled = true;
              state.effort = 'low';
              return;
            }
            const currentIndex = EFFORT_CYCLE.indexOf(state.effort);
            const nextIndex = currentIndex + 1;
            if (nextIndex >= EFFORT_CYCLE.length) {
              // max -> off
              state.enabled = false;
            } else {
              state.effort = EFFORT_CYCLE[nextIndex]!;
            }
          }),
      })),
      {
        name: 'agi-thinking-store',
        storage: createJSONStorage(() => {
          // SSR-safe: return a no-op storage on the server
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

// Selectors
export const selectThinkingEnabled = (state: ThinkingStore) => state.enabled;
export const selectEffortLevel = (state: ThinkingStore) => state.effort;
