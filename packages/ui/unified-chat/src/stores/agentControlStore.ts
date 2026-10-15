import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AgentControlState, AgentMode, Effort } from '@agiworkforce/types';

const GLOBAL_DEFAULT: AgentControlState = {
  mode: 'ask',
  effort: 'medium',
  temporaryChat: false,
  source: 'project-default',
};

type ProjectDefault = Pick<AgentControlState, 'mode' | 'effort' | 'temporaryChat'>;

export const ALL_AGENT_MODES: readonly AgentMode[] = ['ask', 'auto', 'plan', 'bypass'];

const clampedStates = new WeakMap<AgentControlState, AgentControlState>();
const projectStates = new WeakMap<ProjectDefault, AgentControlState>();

/** Same object for the same stored default, for the same reason as below. */
function projectState(projDefault: ProjectDefault): AgentControlState {
  const cached = projectStates.get(projDefault);
  if (cached) return cached;
  const state: AgentControlState = { ...projDefault, source: 'project-default' };
  projectStates.set(projDefault, state);
  return state;
}

/** Same object for the same input, so a selector over `resolve` stays stable. */
function clampToAvailable(
  state: AgentControlState,
  availableModes: readonly AgentMode[],
): AgentControlState {
  if (availableModes.includes(state.mode)) return state;
  const mode = availableModes.includes('ask') ? 'ask' : (availableModes[0] ?? 'ask');
  const cached = clampedStates.get(state);
  if (cached?.mode === mode) return cached;
  const clamped = { ...state, mode };
  clampedStates.set(state, clamped);
  return clamped;
}

interface AgentControlStore {
  byConversation: Record<string, AgentControlState>;
  byProject: Record<string, ProjectDefault>;

  /** Modes the host runtime enforces. The mode chip offers only these. */
  availableModes: readonly AgentMode[];

  setAvailableModes: (modes: readonly AgentMode[]) => void;

  resolve: (conversationId: string, projectId: string | null) => AgentControlState;

  setMode: (conversationId: string, mode: AgentMode) => void;

  setEffort: (conversationId: string, effort: Effort) => void;

  setTemporaryChat: (conversationId: string, value: boolean) => void;

  setProjectDefault: (projectId: string, partial: Partial<ProjectDefault>) => void;

  clearConversationOverride: (conversationId: string) => void;
}

const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  length: 0,
  clear: () => {},
  key: () => null,
};

export const useAgentControlStore = create<AgentControlStore>()(
  persist(
    (set, get) => ({
      byConversation: {},
      byProject: {},
      availableModes: ALL_AGENT_MODES,

      setAvailableModes: (modes) => set({ availableModes: modes }),

      resolve: (conversationId, projectId) => {
        const { byConversation, byProject, availableModes } = get();

        const convOverride = byConversation[conversationId];
        if (convOverride) return clampToAvailable(convOverride, availableModes);

        if (projectId) {
          const projDefault = byProject[projectId];
          if (projDefault) {
            return clampToAvailable(projectState(projDefault), availableModes);
          }
        }

        return clampToAvailable(GLOBAL_DEFAULT, availableModes);
      },

      setMode: (conversationId, mode) =>
        set((state) => {
          const { byConversation, byProject } = state;
          const existing = byConversation[conversationId] ?? GLOBAL_DEFAULT;
          return {
            byConversation: {
              ...byConversation,
              [conversationId]: {
                ...existing,
                mode,
                source: 'conversation-override' as const,
              },
            },
            byProject,
          };
        }),

      setEffort: (conversationId, effort) =>
        set((state) => {
          const { byConversation, byProject } = state;
          const existing = byConversation[conversationId] ?? GLOBAL_DEFAULT;
          return {
            byConversation: {
              ...byConversation,
              [conversationId]: {
                ...existing,
                effort,
                source: 'conversation-override' as const,
              },
            },
            byProject,
          };
        }),

      setTemporaryChat: (conversationId, value) =>
        set((state) => {
          const { byConversation, byProject } = state;
          const existing = byConversation[conversationId] ?? GLOBAL_DEFAULT;
          return {
            byConversation: {
              ...byConversation,
              [conversationId]: {
                ...existing,
                temporaryChat: value,
                source: 'conversation-override' as const,
              },
            },
            byProject,
          };
        }),

      setProjectDefault: (projectId, partial) =>
        set((state) => {
          const existing: ProjectDefault = state.byProject[projectId] ?? {
            mode: GLOBAL_DEFAULT.mode,
            effort: GLOBAL_DEFAULT.effort,
            temporaryChat: GLOBAL_DEFAULT.temporaryChat,
          };
          return {
            byConversation: state.byConversation,
            byProject: {
              ...state.byProject,
              [projectId]: { ...existing, ...partial },
            },
          };
        }),

      clearConversationOverride: (conversationId) =>
        set((state) => {
          const next = { ...state.byConversation };
          delete next[conversationId];
          return { byConversation: next, byProject: state.byProject };
        }),
    }),
    {
      name: 'agi-agent-control',
      version: 1,
      migrate: (persisted) => persisted,
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : window.localStorage,
      ),
      partialize: (state) => ({
        byConversation: state.byConversation,
        byProject: state.byProject,
      }),
    },
  ),
);
