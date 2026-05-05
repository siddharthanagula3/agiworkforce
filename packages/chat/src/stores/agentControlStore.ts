/**
 * agentControlStore — per-project defaults with per-conversation override.
 *
 * Resolution order (per DECISIONS.md D3):
 *   1. byConversation[conversationId]  → source: 'conversation-override'
 *   2. byProject[projectId]            → source: 'project-default'
 *   3. Global default                  → source: 'project-default'
 *
 * Mutation helpers always write to byConversation, tagging source as
 * 'conversation-override'. Project defaults are set explicitly via
 * setProjectDefault (called by project settings UI, not yet wired to Supabase
 * — see follow-up task to persist via connectorsStore pattern).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AgentControlState, AgentMode, Effort } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Global default — used when neither conversation nor project has a value
// ---------------------------------------------------------------------------

const GLOBAL_DEFAULT: AgentControlState = {
  mode: 'auto',
  effort: 'medium',
  temporaryChat: false,
  source: 'project-default',
};

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type ProjectDefault = Pick<AgentControlState, 'mode' | 'effort' | 'temporaryChat'>;

interface AgentControlStore {
  /** Per-conversation overrides, indexed by conversationId. */
  byConversation: Record<string, AgentControlState>;
  /** Project defaults, indexed by projectId. */
  byProject: Record<string, ProjectDefault>;

  /**
   * Resolve the effective AgentControlState for a given conversation.
   *
   * Priority: conversation override > project default > global default.
   */
  resolve: (conversationId: string, projectId: string | null) => AgentControlState;

  /** Set the agent mode for a conversation (marks source: 'conversation-override'). */
  setMode: (conversationId: string, mode: AgentMode) => void;

  /** Set the effort level for a conversation (marks source: 'conversation-override'). */
  setEffort: (conversationId: string, effort: Effort) => void;

  /** Toggle temporary-chat for a conversation (marks source: 'conversation-override'). */
  setTemporaryChat: (conversationId: string, value: boolean) => void;

  /** Set or update a project-level default. Does not affect existing conversation overrides. */
  setProjectDefault: (projectId: string, partial: Partial<ProjectDefault>) => void;

  /** Remove the conversation override, reverting to project/global default. */
  clearConversationOverride: (conversationId: string) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

/** SSR-safe localStorage fallback. */
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

      resolve: (conversationId, projectId) => {
        const { byConversation, byProject } = get();

        // 1. Conversation-level override takes precedence
        const convOverride = byConversation[conversationId];
        if (convOverride) return convOverride;

        // 2. Project default
        if (projectId) {
          const projDefault = byProject[projectId];
          if (projDefault) {
            return { ...projDefault, source: 'project-default' };
          }
        }

        // 3. Global default
        return GLOBAL_DEFAULT;
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
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : window.localStorage,
      ),
      // Persist only the two maps — the resolve function is derived
      partialize: (state) => ({
        byConversation: state.byConversation,
        byProject: state.byProject,
      }),
    },
  ),
);
