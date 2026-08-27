jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockListRuns = jest.fn();
const mockFollowRun = jest.fn();
const mockResumeRun = jest.fn();
const mockCancelRun = jest.fn();

jest.mock('@/services/streaming', () => ({
  createMobileCloudAgentRunClient: () => ({
    listRuns: mockListRuns,
    followRun: mockFollowRun,
    resumeRun: mockResumeRun,
    cancelRun: mockCancelRun,
  }),
}));

import {
  ManagedCloudAgentRunApprovalExpiredError,
  type CloudAgentRun,
  type CloudAgentRunSnapshotPage,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  activateCloudAccount,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';
import { ALL_CLOUD_RUN_STATES, cloudRunFilterStates } from '../runPresentation';
import { useCloudTaskStore } from '../store';

const RUN_ID = '01920000-0000-7000-8000-000000000001';
const NOW = Date.parse('2026-08-27T12:00:00.000Z');

function cloudRun(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: RUN_ID,
    userId: 'user_1',
    requestId: 'req_1',
    conversationId: null,
    originSurface: 'cli',
    workMode: 'agiwork',
    state: 'running',
    provider: 'managed',
    model: 'test-model',
    lastEventSequence: 1,
    cancellationRequestedAt: null,
    completedAt: null,
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function envelope(event: AgentEventEnvelope['event'], sequence: number): AgentEventEnvelope {
  return {
    schemaVersion: 4,
    sessionId: 'session_1',
    turnId: 'turn_1',
    sequence,
    emittedAtMs: NOW,
    event,
  };
}

function snapshot(
  run: CloudAgentRun,
  events: AgentEventEnvelope[] = [],
): CloudAgentRunSnapshotPage {
  return { run, events, nextAfterSequence: events.length - 1 };
}

function pendingApprovalRun(): CloudAgentRun {
  return cloudRun({
    state: 'awaiting_input',
    pendingApproval: {
      requestedAt: new Date(NOW).toISOString(),
      toolCalls: [
        { toolCallId: 'call_1', name: 'shell', argsPreview: 'rm -rf build' },
        { toolCallId: 'call_2', name: 'fetch', argsPreview: 'https://example.test' },
      ],
    },
  });
}

function followsWith(page: CloudAgentRunSnapshotPage): void {
  mockFollowRun.mockImplementation(
    async (_runId: string, options: { onSnapshot?: (p: CloudAgentRunSnapshotPage) => void }) => {
      await options.onSnapshot?.(page);
      return { run: page.run, lastSequence: page.nextAfterSequence };
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  useCloudTaskStore.getState().reset();
  useCloudTaskStore.setState({ filter: 'all' });
  mockListRuns.mockResolvedValue({ runs: [], nextCursor: null });
});

describe('cloud task list', () => {
  it('does nothing without an activated cloud account', async () => {
    await useCloudTaskStore.getState().load('initial');

    expect(mockListRuns).not.toHaveBeenCalled();
    expect(useCloudTaskStore.getState().status).toBe('idle');
  });

  it('asks for every state so runs from any surface are visible', async () => {
    activateCloudAccount('user_1');
    const run = cloudRun({ originSurface: 'web' });
    mockListRuns.mockResolvedValue({ runs: [run], nextCursor: 'cursor_1' });

    await useCloudTaskStore.getState().load('initial');

    expect(mockListRuns).toHaveBeenCalledWith(
      expect.objectContaining({ states: [...ALL_CLOUD_RUN_STATES] }),
    );
    expect(useCloudTaskStore.getState().runs).toEqual([run]);
    expect(useCloudTaskStore.getState().nextCursor).toBe('cursor_1');
    expect(useCloudTaskStore.getState().status).toBe('loaded');
  });

  it('narrows to the blocking states when that filter is chosen', async () => {
    activateCloudAccount('user_1');

    useCloudTaskStore.getState().setFilter('blocked');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockListRuns).toHaveBeenCalledWith(
      expect.objectContaining({ states: cloudRunFilterStates('blocked') }),
    );
  });

  it('appends the next page behind the cursor', async () => {
    activateCloudAccount('user_1');
    const first = cloudRun({ id: 'a' });
    const second = cloudRun({ id: 'b' });
    mockListRuns.mockResolvedValueOnce({ runs: [first], nextCursor: 'cursor_1' });
    await useCloudTaskStore.getState().load('initial');

    mockListRuns.mockResolvedValueOnce({ runs: [second], nextCursor: null });
    await useCloudTaskStore.getState().loadMore();

    expect(mockListRuns).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor_1' }));
    expect(useCloudTaskStore.getState().runs.map((run) => run.id)).toEqual(['a', 'b']);
    expect(useCloudTaskStore.getState().nextCursor).toBeNull();
  });

  it('keeps the durable list when a background refresh fails', async () => {
    activateCloudAccount('user_1');
    const run = cloudRun();
    mockListRuns.mockResolvedValueOnce({ runs: [run], nextCursor: null });
    await useCloudTaskStore.getState().load('initial');

    mockListRuns.mockRejectedValueOnce(new Error('offline'));
    await useCloudTaskStore.getState().load('background');

    expect(useCloudTaskStore.getState().runs).toEqual([run]);
    expect(useCloudTaskStore.getState().error).toBeNull();
  });

  it('surfaces a failed user-initiated load', async () => {
    activateCloudAccount('user_1');
    mockListRuns.mockRejectedValueOnce(new Error('offline'));

    await useCloudTaskStore.getState().load('initial');

    expect(useCloudTaskStore.getState().status).toBe('error');
    expect(useCloudTaskStore.getState().error).toBe('offline');
  });
});

describe('following one cloud run', () => {
  it('folds the followed events into a transcript and an activity trail', async () => {
    activateCloudAccount('user_1');
    followsWith(
      snapshot(cloudRun({ state: 'completed' }), [
        envelope({ type: 'text-delta', delta: 'Done: ' }, 0),
        envelope({ type: 'text-delta', delta: 'shipped' }, 1),
        envelope(
          {
            type: 'tool-execution-start',
            toolCallId: 'call_1',
            name: 'shell',
            category: 'shell',
            summary: 'Running the build',
            input: {},
          },
          2,
        ),
      ]),
    );

    await useCloudTaskStore.getState().openRun(RUN_ID);

    const detail = useCloudTaskStore.getState().detail;
    expect(detail?.transcript).toBe('Done: shipped');
    expect(detail?.activity.map((line) => line.label)).toEqual(['Running the build']);
    expect(detail?.status).toBe('settled');
  });

  it('stops following and drops the detail when the sheet closes', async () => {
    activateCloudAccount('user_1');
    followsWith(snapshot(cloudRun({ state: 'completed' })));
    await useCloudTaskStore.getState().openRun(RUN_ID);

    useCloudTaskStore.getState().closeRun();

    expect(useCloudTaskStore.getState().detail).toBeNull();
  });

  it('reports a follow failure against the open run', async () => {
    activateCloudAccount('user_1');
    mockFollowRun.mockRejectedValueOnce(new Error('HTTP 503: upstream'));

    await useCloudTaskStore.getState().openRun(RUN_ID);

    expect(useCloudTaskStore.getState().detail?.status).toBe('error');
    expect(useCloudTaskStore.getState().detail?.error).toBe('HTTP 503: upstream');
  });
});

describe('resolving the approval blocking a run', () => {
  it('answers every pending tool call with one decision and re-follows', async () => {
    activateCloudAccount('user_1');
    followsWith(snapshot(pendingApprovalRun()));
    await useCloudTaskStore.getState().openRun(RUN_ID);

    mockResumeRun.mockResolvedValueOnce(undefined);
    followsWith(snapshot(cloudRun({ state: 'running' })));
    await useCloudTaskStore.getState().resolveApproval('approved');

    expect(mockResumeRun).toHaveBeenCalledWith(
      RUN_ID,
      [
        { toolCallId: 'call_1', decision: 'approved' },
        { toolCallId: 'call_2', decision: 'approved' },
      ],
      expect.anything(),
    );
    expect(useCloudTaskStore.getState().detail?.run?.state).toBe('running');
    expect(useCloudTaskStore.getState().detail?.pendingAction).toBeNull();
  });

  it('explains an approval that expired before the tap landed', async () => {
    activateCloudAccount('user_1');
    followsWith(snapshot(pendingApprovalRun()));
    await useCloudTaskStore.getState().openRun(RUN_ID);

    mockResumeRun.mockRejectedValueOnce(
      new ManagedCloudAgentRunApprovalExpiredError('HTTP 410: gone'),
    );
    await useCloudTaskStore.getState().resolveApproval('rejected');

    expect(useCloudTaskStore.getState().detail?.error).toBe(
      'This approval expired, so the task cannot continue from it',
    );
    expect(useCloudTaskStore.getState().detail?.pendingAction).toBeNull();
  });

  it('ignores a decision on a run that is not blocked', async () => {
    activateCloudAccount('user_1');
    followsWith(snapshot(cloudRun({ state: 'running' })));
    await useCloudTaskStore.getState().openRun(RUN_ID);

    await useCloudTaskStore.getState().resolveApproval('approved');

    expect(mockResumeRun).not.toHaveBeenCalled();
  });
});

describe('stopping a cloud run', () => {
  it('cancels the open run and settles it', async () => {
    activateCloudAccount('user_1');
    followsWith(snapshot(cloudRun({ state: 'running' })));
    await useCloudTaskStore.getState().openRun(RUN_ID);

    mockCancelRun.mockResolvedValueOnce(cloudRun({ state: 'cancelled' }));
    await useCloudTaskStore.getState().stopRun();

    expect(mockCancelRun).toHaveBeenCalledWith(RUN_ID, expect.anything());
    expect(useCloudTaskStore.getState().detail?.run?.state).toBe('cancelled');
    expect(useCloudTaskStore.getState().detail?.status).toBe('settled');
  });
});
