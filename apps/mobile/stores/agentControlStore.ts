
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { AgentControlState, AgentMode, Effort } from '@agiworkforce/types';

export type PickerEffort = Effort;

type AgentControlStateUI = Omit<AgentControlState, 'effort'> & { effort: PickerEffort };

const GLOBAL_DEFAULT: AgentControlStateUI = {
  mode: 'auto',
  effort: 'medium',
  temporaryChat: false,
  source: 'project-default',
};

type ProjectDefault = Pick<AgentControlStateUI, 'mode' | 'effort' | 'temporaryChat'>;

interface AgentControlStore {
  byConversation: Record<string, AgentControlStateUI>;
  byProject: Record<string, ProjectDefault>;

  resolve: (conversationId: string, projectId: string | null) => AgentControlStateUI;

  setMode: (conversationId: string, mode: AgentMode) => void;

  setEffort: (conversationId: string, effort: PickerEffort) => void;

  setTemporaryChat: (conversationId: string, value: boolean) => void;

  setProjectDefault: (projectId: string, partial: Partial<ProjectDefault>) => void;

  clearConversationOverride: (conversationId: string) => void;

  clearCloudOverrides: (conversationIds: string[], projectIds: string[]) => void;
}

export const useAgentControlStore = create<AgentControlStore>()(
  persist(
    (set, get) => ({
      byConversation: {},
      byProject: {},

      resolve: (conversationId, projectId) => {
        const { byConversation, byProject } = get();

        const convOverride = byConversation[conversationId];
        if (convOverride) return convOverride;

        const effectiveProjectId = projectId ?? '__default__';
        const projDefault = byProject[effectiveProjectId];
        if (projDefault) {
          return { ...projDefault, source: 'project-default' };
        }

        return GLOBAL_DEFAULT;
      },

      setMode: (conversationId, mode) =>
        set((state) => {
          const existing = state.byConversation[conversationId] ?? GLOBAL_DEFAULT;
          return {
            byConversation: {
              ...state.byConversation,
              [conversationId]: {
                ...existing,
                mode,
                source: 'conversation-override' as const,
              },
            },
          };
        }),

      setEffort: (conversationId, effort) =>
        set((state) => {
          const existing = state.byConversation[conversationId] ?? GLOBAL_DEFAULT;
          return {
            byConversation: {
              ...state.byConversation,
              [conversationId]: {
                ...existing,
                effort,
                source: 'conversation-override' as const,
              },
            },
          };
        }),

      setTemporaryChat: (conversationId, value) =>
        set((state) => {
          const existing = state.byConversation[conversationId] ?? GLOBAL_DEFAULT;
          return {
            byConversation: {
              ...state.byConversation,
              [conversationId]: {
                ...existing,
                temporaryChat: value,
                source: 'conversation-override' as const,
              },
            },
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
          return { byConversation: next };
        }),

      clearCloudOverrides: (conversationIds, projectIds) =>
        set((state) => {
          const cloudConversationIds = new Set(conversationIds);
          const cloudProjectIds = new Set(projectIds);
          return {
            byConversation: Object.fromEntries(
              Object.entries(state.byConversation).filter(
                ([conversationId]) => !cloudConversationIds.has(conversationId),
              ),
            ),
            byProject: Object.fromEntries(
              Object.entries(state.byProject).filter(
                ([projectId]) => !cloudProjectIds.has(projectId),
              ),
            ),
          };
        }),
    }),
    {
      name: 'agent-control-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      version: 2,
      migrate: (persistedState, fromVersion) => {
        if (fromVersion < 2) {
          const legacy = persistedState as {
            agentMode?: AgentMode;
            effort?: PickerEffort;
            byConversation?: Record<string, AgentControlStateUI>;
            byProject?: Record<string, ProjectDefault>;
          };
          const migratedMode: AgentMode = legacy.agentMode ?? GLOBAL_DEFAULT.mode;
          const migratedEffort: PickerEffort = legacy.effort ?? GLOBAL_DEFAULT.effort;
          return {
            byConversation: legacy.byConversation ?? {},
            byProject: {
              ...(legacy.byProject ?? {}),
              __default__: {
                mode: migratedMode,
                effort: migratedEffort,
                temporaryChat: false,
              },
            },
          };
        }
        return persistedState as {
          byConversation: Record<string, AgentControlStateUI>;
          byProject: Record<string, ProjectDefault>;
        };
      },
      partialize: (state) => ({
        byConversation: state.byConversation,
        byProject: state.byProject,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[agentControlStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useAgentControlStore, 'agent-control-store');
