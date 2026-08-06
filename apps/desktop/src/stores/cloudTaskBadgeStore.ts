/**
 * Cloud task badge — the count behind the Tasks nav pill.
 *
 * Durable Managed Cloud agent runs keep going with Desktop closed, so a run can
 * stop and wait for the user while nothing on screen says so. This store polls
 * one `listRuns` call and exposes how many runs are waiting on the user.
 *
 * Trust boundary: this is a Managed Cloud read and nothing else. `refresh()`
 * fails closed unless the app is in managed mode with a live cloud account
 * session, so a Local/BYOK session never issues the request, and `reset()`
 * clears the count the moment either condition stops holding — a badge that
 * outlived its session would be both stale and a cross-boundary leak.
 *
 * Deliberately NOT persisted: a count restored from disk would assert pending
 * work that may have completed while the app was closed.
 */
import { create } from 'zustand';
// Derived from the run contract rather than the parallel protocol enum, so the
// state literals here are exactly what listRuns accepts and cannot drift from it.
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';

type AgentTaskState = CloudAgentRun['state'];
import { createDesktopCloudAgentRunClient } from '@/api/cloudApi';
import { selectHasCloudAccountSession, useUnifiedAuthStore } from './auth';
import { selectPrivacyMode, useAppModeStore } from './appModeStore';

/**
 * States a run can sit in without finishing. `awaiting_input` and `paused` are
 * the two that need a human; `queued`/`running` are counted separately so the
 * badge can distinguish "needs you" from "still working".
 */
const NEEDS_USER_STATES: AgentTaskState[] = ['awaiting_input', 'paused'];
const ACTIVE_STATES: AgentTaskState[] = ['queued', 'running', 'awaiting_input', 'paused'];

/** The client caps a page at 100; more unfinished runs than that is implausible. */
const PAGE_LIMIT = 100;

export interface CloudTaskBadgeState {
  /** Runs stopped waiting on the user (awaiting_input + paused). */
  needsUserCount: number;
  /** All unfinished runs, including the ones still working unattended. */
  activeCount: number;
  /** True when the server had more than one page, so the counts are a floor. */
  truncated: boolean;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  /** Set only for surfacing in dev/devtools; the nav never renders an error. */
  error: string | null;

  refresh: () => Promise<void>;
  reset: () => void;
}

/**
 * Managed mode with a live account session is the only state in which the run
 * client is authenticated and the request is inside the trust boundary.
 */
function canReadCloudRuns(): boolean {
  return (
    selectPrivacyMode(useAppModeStore.getState()) === 'managed' &&
    selectHasCloudAccountSession(useUnifiedAuthStore.getState())
  );
}

const EMPTY = {
  needsUserCount: 0,
  activeCount: 0,
  truncated: false,
  error: null,
} as const;

export const useCloudTaskBadgeStore = create<CloudTaskBadgeState>()((set) => ({
  ...EMPTY,
  status: 'idle',

  refresh: async () => {
    if (!canReadCloudRuns()) {
      // Not an error: Local sessions simply have no cloud runs to count.
      set({ ...EMPTY, status: 'idle' });
      return;
    }

    set({ status: 'loading' });
    try {
      const page = await createDesktopCloudAgentRunClient().listRuns({
        states: ACTIVE_STATES,
        limit: PAGE_LIMIT,
      });

      // The session can end mid-flight; drop a response that arrived after the
      // boundary moved rather than badging a signed-out or Local shell.
      if (!canReadCloudRuns()) {
        set({ ...EMPTY, status: 'idle' });
        return;
      }

      const needsUserCount = page.runs.filter((run) =>
        NEEDS_USER_STATES.includes(run.state),
      ).length;

      set({
        needsUserCount,
        activeCount: page.runs.length,
        truncated: page.nextCursor !== null,
        status: 'loaded',
        error: null,
      });
    } catch (error) {
      // A failed poll must not invent or keep a count. Showing nothing is the
      // honest state when we do not know.
      set({
        ...EMPTY,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  reset: () => set({ ...EMPTY, status: 'idle' }),
}));

export const selectCloudTaskNeedsUserCount = (state: CloudTaskBadgeState): number =>
  state.needsUserCount;
