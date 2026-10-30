import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Effort } from '@agiworkforce/types';

export type EffortLevel = Effort;

const DEFAULT_EFFORT: EffortLevel = 'medium';

const EFFORT_CYCLE: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export interface ThinkingPreference {
  enabled: boolean;
  effort: EffortLevel;
}

interface ThinkingState {
  enabled: boolean;
  effort: EffortLevel;
  fast: boolean;
  byConversation: Record<string, ThinkingPreference>;
}

interface ThinkingActions {
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
  setEffort: (level: EffortLevel) => void;
  cycleEffort: () => void;
  setFast: (fast: boolean) => void;
  setConversationEnabled: (conversationId: string, enabled: boolean) => void;
  setConversationEffort: (conversationId: string, effort: EffortLevel) => void;
  clearConversationPreference: (conversationId: string) => void;
  adoptConversationPreference: (fromId: string, toId: string) => void;
}

export type ThinkingStore = ThinkingState & ThinkingActions;

export const useThinkingStore = create<ThinkingStore>()(
  devtools(
    persist(
      immer<ThinkingStore>((set) => ({
        enabled: false,
        effort: DEFAULT_EFFORT,
        fast: false,
        byConversation: {},

        setConversationEnabled: (conversationId, enabled) =>
          set((state) => {
            const current = state.byConversation[conversationId] ?? state;
            state.byConversation[conversationId] = {
              enabled,
              effort: enabled && current.effort === 'none' ? DEFAULT_EFFORT : current.effort,
            };
          }),

        setConversationEffort: (conversationId, effort) =>
          set((state) => {
            state.byConversation[conversationId] = { enabled: effort !== 'none', effort };
          }),

        clearConversationPreference: (conversationId) =>
          set((state) => {
            delete state.byConversation[conversationId];
          }),

        adoptConversationPreference: (fromId, toId) =>
          set((state) => {
            if (fromId === toId) return;
            const preference = state.byConversation[fromId];
            if (preference && !state.byConversation[toId]) {
              state.byConversation[toId] = preference;
            }
            delete state.byConversation[fromId];
          }),

        setFast: (fast) =>
          set((state) => {
            state.fast = fast;
          }),

        setEnabled: (enabled) =>
          set((state) => {
            state.enabled = enabled;
            if (enabled && state.effort === 'none') state.effort = DEFAULT_EFFORT;
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
            state.enabled = level !== 'none';
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
