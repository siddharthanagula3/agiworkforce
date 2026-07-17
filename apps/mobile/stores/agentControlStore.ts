/**
 * agentControlStore — per-project defaults with per-conversation override.
 *
 * Resolution order (per DECISIONS.md D3):
 *   1. byConversation[conversationId]  → source: 'conversation-override'
 *   2. byProject[projectId]            → source: 'project-default'
 *   3. Global default                  → source: 'project-default'
 *
 * Migration: legacy single-field state (agentMode + effort) is migrated into
 * byProject['__default__'] on first rehydration so existing users lose nothing.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { AgentControlState, AgentMode, Effort } from '@agiworkforce/types';

/**
 * Effort ladder as the model picker renders it, per-model, from models.json
 * `reasoning.supportedEfforts` (docs/research/reasoning-effort-capability-matrix-2026-07-10.md).
 * A superset of the shared `Effort` (packages/contracts/types/design-system/effort.ts,
 * locked vocabulary D5, used by web/desktop's request-wire path): some models
 * legitimately expose `'none'` (e.g. gpt-5.4-mini) as a selectable level.
 * `'minimal'` is kept in the union too for any model that exposes it — no
 * current OpenAI catalog model does after the 2026-07-11 gpt-5-nano ->
 * gpt-5.4-nano rename (gpt-5-nano was the last one), but BYOK/future catalog
 * entries may. Widened here rather than in the shared
 * `Effort` union because that union backs non-partial `Record<Effort, …>`
 * maps in web/desktop-shared files (e.g. packages/ui/unified-chat's
 * AgentControl.tsx) that this mobile-only change must not break.
 *
 * `chatExecutionStore` coerces `'none'`/`'minimal'` to "omit the effort
 * param" at the `streamChat` request boundary until per-model request-path
 * support for those two values is verified server-side — tracked gap, not
 * silently assumed correct.
 */
export type PickerEffort = Effort | 'none' | 'minimal';

type AgentControlStateUI = Omit<AgentControlState, 'effort'> & { effort: PickerEffort };

// ---------------------------------------------------------------------------
// Global default — used when neither conversation nor project has a value
// ---------------------------------------------------------------------------

const GLOBAL_DEFAULT: AgentControlStateUI = {
  mode: 'auto',
  effort: 'medium',
  temporaryChat: false,
  source: 'project-default',
};

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type ProjectDefault = Pick<AgentControlStateUI, 'mode' | 'effort' | 'temporaryChat'>;

interface AgentControlStore {
  /** Per-conversation overrides, indexed by conversationId. */
  byConversation: Record<string, AgentControlStateUI>;
  /** Project defaults, indexed by projectId. '__default__' is used for migrated legacy state. */
  byProject: Record<string, ProjectDefault>;

  /**
   * Resolve the effective AgentControlState for a given conversation.
   *
   * Priority: conversation override > project default > global default.
   */
  resolve: (conversationId: string, projectId: string | null) => AgentControlStateUI;

  /** Set the agent mode for a conversation (marks source: 'conversation-override'). */
  setMode: (conversationId: string, mode: AgentMode) => void;

  /** Set the effort level for a conversation (marks source: 'conversation-override'). */
  setEffort: (conversationId: string, effort: PickerEffort) => void;

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

        // 2. Project default (or migrated legacy default under '__default__')
        const effectiveProjectId = projectId ?? '__default__';
        const projDefault = byProject[effectiveProjectId];
        if (projDefault) {
          return { ...projDefault, source: 'project-default' };
        }

        // 3. Global fallback
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
    }),
    {
      name: 'agent-control-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      version: 2,
      migrate: (persistedState, fromVersion) => {
        // v1 → v2: flat agentMode + effort migrate to byProject['__default__']
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
