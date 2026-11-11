import { create } from 'zustand';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';

type AgentTaskState = CloudAgentRun['state'];
import { createDesktopCloudAgentRunClient } from '@/api/cloudApi';
import { selectHasCloudAccountSession, useUnifiedAuthStore } from './auth';
import { selectPrivacyMode, useAppModeStore } from './appModeStore';

const NEEDS_USER_STATES: AgentTaskState[] = ['awaiting_input', 'paused'];
const ACTIVE_STATES: AgentTaskState[] = ['queued', 'running', 'awaiting_input', 'paused'];

const PAGE_LIMIT = 100;

export interface CloudTaskBadgeState {
  needsUserCount: number;
  activeCount: number;
  truncated: boolean;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;

  refresh: () => Promise<void>;
  reset: () => void;
}

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

let refreshGeneration = 0;

export const useCloudTaskBadgeStore = create<CloudTaskBadgeState>()((set) => ({
  ...EMPTY,
  status: 'idle',

  refresh: async () => {
    const generation = ++refreshGeneration;
    const sessionEpoch = useUnifiedAuthStore.getState().cloudSessionEpoch;
    const isCurrent = () =>
      generation === refreshGeneration &&
      sessionEpoch === useUnifiedAuthStore.getState().cloudSessionEpoch &&
      canReadCloudRuns();
    const settleAbandoned = () => {
      if (generation === refreshGeneration) set({ ...EMPTY, status: 'idle' });
    };
    if (!canReadCloudRuns()) {
      set({ ...EMPTY, status: 'idle' });
      return;
    }

    set({ status: 'loading' });
    try {
      const page = await createDesktopCloudAgentRunClient().listRuns({
        states: ACTIVE_STATES,
        limit: PAGE_LIMIT,
      });

      if (!isCurrent()) {
        settleAbandoned();
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
      if (!isCurrent()) {
        settleAbandoned();
        return;
      }
      set({
        ...EMPTY,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  reset: () => {
    refreshGeneration += 1;
    set({ ...EMPTY, status: 'idle' });
  },
}));
