/**
 * Agent Status Store
 *
 * Zustand store tracking real-time agent execution status.
 * Uses API polling for live updates (Supabase Realtime removed).
 */

'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AgentSession, AgentSessionStatus, AgentStatusSummary } from '@agiworkforce/types';
import { useAuthStore } from '@shared/stores/authentication-store';
import { getAuthToken } from '@shared/lib/get-auth-token';

// ─── State Interface ────────────────────────────────────────────────────────

interface AgentStatusState {
  /** All tracked agent sessions (active + recent). */
  sessions: AgentSession[];

  /** Whether the store is currently loading initial data. */
  isLoading: boolean;

  /** Error message from the last fetch/subscription attempt. */
  error: string | null;

  /** Whether polling subscription is active. */
  isSubscribed: boolean;

  /** Polling interval ID. */
  pollingIntervalId: ReturnType<typeof setInterval> | null;

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Fetch agent sessions from API. */
  fetchSessions: () => Promise<void>;

  /** Start polling for live updates. */
  subscribe: () => void;

  /** Stop polling. */
  unsubscribe: () => void;

  /** Start polling fallback (every 10 seconds). */
  startPolling: () => void;

  /** Stop polling. */
  stopPolling: () => void;

  /** Update a single session (from polling event). */
  upsertSession: (session: AgentSession) => void;

  /** Remove a session by ID. */
  removeSession: (sessionId: string) => void;

  /** Reset the store. */
  reset: () => void;
}

// ─── Initial State ──────────────────────────────────────────────────────────

const initialState = {
  sessions: [] as AgentSession[],
  isLoading: false,
  error: null as string | null,
  isSubscribed: false,
  pollingIntervalId: null as ReturnType<typeof setInterval> | null,
};

const POLLING_INTERVAL_MS = 10_000;

// ─── Store ──────────────────────────────────────────────────────────────────

export const useAgentStatusStore = create<AgentStatusState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchSessions: async () => {
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;

        set({ isLoading: true, error: null }, undefined, 'agentStatus/fetchSessions:start');

        try {
          const token = await getAuthToken();
          const res = await fetch('/api/agents/sessions', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });

          if (!res.ok) {
            // API may not exist yet — fall back to empty state
            console.warn('[AgentStatusStore] fetch failed, using empty state:', res.status);
            set(
              { sessions: [], isLoading: false, error: null },
              undefined,
              'agentStatus/fetchSessions:fallback',
            );
            return;
          }

          const body = (await res.json()) as { sessions?: Record<string, unknown>[] };
          const sessions: AgentSession[] = (body.sessions ?? []).map(mapRowToSession);
          set({ sessions, isLoading: false }, undefined, 'agentStatus/fetchSessions:success');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn('[AgentStatusStore] fetch error:', message);
          set({ isLoading: false, error: message }, undefined, 'agentStatus/fetchSessions:error');
        }
      },

      subscribe: () => {
        // Supabase Realtime removed; use polling instead
        get().startPolling();
      },

      unsubscribe: () => {
        set({ isSubscribed: false }, undefined, 'agentStatus/unsubscribe');
        get().stopPolling();
      },

      startPolling: () => {
        const existing = get().pollingIntervalId;
        if (existing !== null) return; // Already polling

        // Initial fetch
        void get().fetchSessions();

        const intervalId = setInterval(() => {
          void get().fetchSessions();
        }, POLLING_INTERVAL_MS);

        set(
          { pollingIntervalId: intervalId, isSubscribed: true },
          undefined,
          'agentStatus/startPolling',
        );
      },

      stopPolling: () => {
        const intervalId = get().pollingIntervalId;
        if (intervalId !== null) {
          clearInterval(intervalId);
          set({ pollingIntervalId: null }, undefined, 'agentStatus/stopPolling');
        }
      },

      upsertSession: (session) => {
        set(
          (state) => {
            const existing = state.sessions.findIndex((s) => s.id === session.id);
            if (existing >= 0) {
              const updated = [...state.sessions];
              updated[existing] = session;
              return { sessions: updated };
            }
            return { sessions: [session, ...state.sessions] };
          },
          undefined,
          'agentStatus/upsertSession',
        );
      },

      removeSession: (sessionId) => {
        set(
          (state) => ({
            sessions: state.sessions.filter((s) => s.id !== sessionId),
          }),
          undefined,
          'agentStatus/removeSession',
        );
      },

      reset: () => {
        get().unsubscribe();
        set(initialState, undefined, 'agentStatus/reset');
      },
    }),
    { name: 'AgentStatusStore', enabled: process.env.NODE_ENV === 'development' },
  ),
);

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map an API row (snake_case) to an AgentSession (camelCase). */
function mapRowToSession(row: Record<string, unknown>): AgentSession {
  return {
    id: String(row['id'] ?? ''),
    name: String(row['name'] ?? row['task_name'] ?? 'Agent'),
    status: (row['status'] as AgentSessionStatus) ?? 'running',
    currentAction: (row['current_action'] as string) ?? null,
    startedAt: String(row['started_at'] ?? new Date().toISOString()),
    completedAt: (row['completed_at'] as string) ?? null,
    progress: (row['progress'] as number) ?? null,
    model: (row['model'] as string) ?? undefined,
    iterationCount: (row['iteration_count'] as number) ?? undefined,
    maxIterations: (row['max_iterations'] as number) ?? undefined,
    error: (row['error'] as string) ?? undefined,
    toolCallCount: (row['tool_call_count'] as number) ?? undefined,
    userId: (row['user_id'] as string) ?? undefined,
  };
}

// ─── Selectors ──────────────────────────────────────────────────────────────

/** Get all active (running/paused) sessions. */
export const selectActiveSessions = (state: AgentStatusState): AgentSession[] =>
  state.sessions.filter((s) => s.status === 'running' || s.status === 'paused');

/** Get recently completed/failed sessions (last 10). */
export const selectRecentSessions = (state: AgentStatusState): AgentSession[] =>
  state.sessions
    .filter((s) => s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled')
    .slice(0, 10);

/** Get a summary count of agent statuses. */
export const selectStatusSummary = (state: AgentStatusState): AgentStatusSummary => {
  let running = 0;
  let completed = 0;
  let failed = 0;
  for (const s of state.sessions) {
    if (s.status === 'running' || s.status === 'paused') running++;
    else if (s.status === 'completed') completed++;
    else if (s.status === 'failed' || s.status === 'cancelled') failed++;
  }
  return { running, completed, failed, total: state.sessions.length };
};

/** Convenience hook: get the status summary. */
export const useAgentStatusSummary = (): AgentStatusSummary =>
  useAgentStatusStore(selectStatusSummary);

/** Convenience hook: get active sessions only. */
export const useActiveSessions = (): AgentSession[] => useAgentStatusStore(selectActiveSessions);

/** Convenience hook: get recent sessions only. */
export const useRecentAgentSessions = (): AgentSession[] =>
  useAgentStatusStore(selectRecentSessions);
