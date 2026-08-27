import { create } from 'zustand';
import {
  isCloudAgentRunFollowBoundary,
  type CloudAgentRun,
  type CloudAgentRunSnapshotPage,
  type ManagedCloudAgentRunApprovalDecision,
} from '@agiworkforce/cloud-contracts';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  cloudRunFilterStates,
  cloudRunTextDelta,
  mergeCloudRuns,
  summarizeCloudRunEvent,
  DEFAULT_CLOUD_RUN_FILTER,
  type CloudRunActivityLine,
  type CloudRunFilterKey,
} from './runPresentation';
import {
  cancelCloudRun,
  describeCloudRunError,
  followCloudRun,
  isAbortedCloudRunError,
  listCloudRuns,
  resolveCloudRunApproval,
  CLOUD_RUN_CANCEL_ERROR,
  CLOUD_RUN_DECISION_ERROR,
  CLOUD_RUN_FOLLOW_ERROR,
  CLOUD_RUN_LIST_ERROR,
} from './service';

const MAX_TRANSCRIPT_CHARACTERS = 4_000;
const MAX_ACTIVITY_LINES = 40;

export type CloudRunLoadReason = 'initial' | 'refresh' | 'background';

export type CloudRunDetailStatus = 'loading' | 'live' | 'settled' | 'error';

export type CloudRunPendingAction = 'approve' | 'reject' | 'cancel';

export interface CloudRunDetail {
  runId: string;
  run: CloudAgentRun | null;
  transcript: string;
  activity: CloudRunActivityLine[];
  status: CloudRunDetailStatus;
  error: string | null;
  pendingAction: CloudRunPendingAction | null;
}

export interface CloudTaskState {
  filter: CloudRunFilterKey;
  runs: CloudAgentRun[];
  nextCursor: string | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  detail: CloudRunDetail | null;

  setFilter: (filter: CloudRunFilterKey) => void;
  load: (reason: CloudRunLoadReason) => Promise<void>;
  loadMore: () => Promise<void>;
  openRun: (runId: string) => Promise<void>;
  closeRun: () => void;
  resolveApproval: (decision: ManagedCloudAgentRunApprovalDecision) => Promise<void>;
  stopRun: () => Promise<void>;
  reset: () => void;
}

let followController: AbortController | null = null;

const EMPTY_LIST = {
  runs: [] as CloudAgentRun[],
  nextCursor: null,
  refreshing: false,
  loadingMore: false,
  error: null,
} as const;

function trimTranscript(transcript: string): string {
  return transcript.length > MAX_TRANSCRIPT_CHARACTERS
    ? transcript.slice(transcript.length - MAX_TRANSCRIPT_CHARACTERS)
    : transcript;
}

function applySnapshot(
  detail: CloudRunDetail,
  snapshot: CloudAgentRunSnapshotPage,
): CloudRunDetail {
  let transcript = detail.transcript;
  const activity = [...detail.activity];
  for (const envelope of snapshot.events) {
    transcript += cloudRunTextDelta(envelope);
    const line = summarizeCloudRunEvent(envelope);
    if (line) activity.push(line);
  }

  return {
    ...detail,
    run: snapshot.run,
    transcript: trimTranscript(transcript),
    activity: activity.slice(-MAX_ACTIVITY_LINES),
    status: isCloudAgentRunFollowBoundary(snapshot.run.state) ? 'settled' : 'live',
    error: null,
  };
}

export const useCloudTaskStore = create<CloudTaskState>()((set, get) => ({
  ...EMPTY_LIST,
  filter: DEFAULT_CLOUD_RUN_FILTER,
  status: 'idle',
  detail: null,

  setFilter: (filter) => {
    if (get().filter === filter) return;
    set({ ...EMPTY_LIST, filter, status: 'idle' });
    void get().load('initial');
  },

  load: async (reason) => {
    const account = captureCloudAccountEpoch();
    if (!account) {
      set({ ...EMPTY_LIST, status: 'idle' });
      return;
    }

    if (reason === 'initial') set({ status: 'loading', error: null });
    if (reason === 'refresh') set({ refreshing: true });

    try {
      const page = await listCloudRuns({ states: cloudRunFilterStates(get().filter) });
      if (!isCloudAccountEpochCurrent(account)) return;
      set({ runs: page.runs, nextCursor: page.nextCursor, status: 'loaded', error: null });
    } catch (error) {
      if (!isCloudAccountEpochCurrent(account) || reason === 'background') return;
      set({ status: 'error', error: describeCloudRunError(error, CLOUD_RUN_LIST_ERROR) });
    } finally {
      if (isCloudAccountEpochCurrent(account)) set({ refreshing: false });
    }
  },

  loadMore: async () => {
    const { nextCursor, loadingMore } = get();
    if (!nextCursor || loadingMore) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;

    set({ loadingMore: true });
    try {
      const page = await listCloudRuns({
        states: cloudRunFilterStates(get().filter),
        cursor: nextCursor,
      });
      if (!isCloudAccountEpochCurrent(account)) return;
      set((state) => ({
        runs: mergeCloudRuns(state.runs, page.runs),
        nextCursor: page.nextCursor,
        error: null,
      }));
    } catch (error) {
      if (!isCloudAccountEpochCurrent(account)) return;
      set({ error: describeCloudRunError(error, CLOUD_RUN_LIST_ERROR) });
    } finally {
      if (isCloudAccountEpochCurrent(account)) set({ loadingMore: false });
    }
  },

  openRun: async (runId) => {
    const account = captureCloudAccountEpoch();
    if (!account) return;

    followController?.abort();
    const controller = new AbortController();
    followController = controller;

    set({
      detail: {
        runId,
        run: null,
        transcript: '',
        activity: [],
        status: 'loading',
        error: null,
        pendingAction: null,
      },
    });

    const isCurrent = () =>
      !controller.signal.aborted &&
      isCloudAccountEpochCurrent(account) &&
      get().detail?.runId === runId;

    try {
      await followCloudRun(runId, {
        signal: controller.signal,
        onSnapshot: (snapshot) => {
          if (!isCurrent()) return;
          set((state) => (state.detail ? { detail: applySnapshot(state.detail, snapshot) } : {}));
        },
      });
    } catch (error) {
      if (isAbortedCloudRunError(error) || !isCurrent()) return;
      set((state) =>
        state.detail
          ? {
              detail: {
                ...state.detail,
                status: 'error',
                error: describeCloudRunError(error, CLOUD_RUN_FOLLOW_ERROR),
              },
            }
          : {},
      );
    } finally {
      if (followController === controller) followController = null;
      if (isCloudAccountEpochCurrent(account)) void get().load('background');
    }
  },

  closeRun: () => {
    followController?.abort();
    followController = null;
    set({ detail: null });
  },

  resolveApproval: async (decision) => {
    const detail = get().detail;
    const pending = detail?.run?.pendingApproval;
    if (!detail || !pending) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;

    set({
      detail: {
        ...detail,
        pendingAction: decision === 'approved' ? 'approve' : 'reject',
        error: null,
      },
    });

    try {
      await resolveCloudRunApproval(
        detail.runId,
        pending.toolCalls.map((call) => call.toolCallId),
        decision,
      );
      if (!isCloudAccountEpochCurrent(account)) return;
      await get().openRun(detail.runId);
    } catch (error) {
      if (!isCloudAccountEpochCurrent(account)) return;
      set((state) =>
        state.detail?.runId === detail.runId
          ? {
              detail: {
                ...state.detail,
                pendingAction: null,
                error: describeCloudRunError(error, CLOUD_RUN_DECISION_ERROR),
              },
            }
          : {},
      );
      void get().load('background');
    }
  },

  stopRun: async () => {
    const detail = get().detail;
    if (!detail) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;

    set({ detail: { ...detail, pendingAction: 'cancel', error: null } });

    try {
      const run = await cancelCloudRun(detail.runId);
      if (!isCloudAccountEpochCurrent(account)) return;
      set((state) =>
        state.detail?.runId === detail.runId
          ? { detail: { ...state.detail, run, status: 'settled', pendingAction: null } }
          : {},
      );
    } catch (error) {
      if (!isCloudAccountEpochCurrent(account)) return;
      set((state) =>
        state.detail?.runId === detail.runId
          ? {
              detail: {
                ...state.detail,
                pendingAction: null,
                error: describeCloudRunError(error, CLOUD_RUN_CANCEL_ERROR),
              },
            }
          : {},
      );
    } finally {
      if (isCloudAccountEpochCurrent(account)) void get().load('background');
    }
  },

  reset: () => {
    followController?.abort();
    followController = null;
    set({ ...EMPTY_LIST, status: 'idle', detail: null });
  },
}));
