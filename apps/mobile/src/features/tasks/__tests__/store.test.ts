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
const mockPauseRun = jest.fn();
const mockResumePausedRun = jest.fn();
const mockAnswerRunInput = jest.fn();

jest.mock('@/services/streaming', () => ({
  createMobileCloudAgentRunClient: () => ({
    listRuns: mockListRuns,
    followRun: mockFollowRun,
    resumeRun: mockResumeRun,
    answerRunInput: mockAnswerRunInput,
    cancelRun: mockCancelRun,
    pauseRun: mockPauseRun,
    resumePausedRun: mockResumePausedRun,
  }),
}));

import {
  ManagedCloudAgentRunApprovalExpiredError,
  ManagedCloudAgentRunHttpError,
  type CloudAgentRun,
  type CloudAgentRunSnapshotPage,
  AGENT_EVENT_SCHEMA_VERSION,
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
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function settle(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
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
    expect(useCloudTaskStore.getState().error).toBe('Cloud tasks could not be loaded');
  });
});

describe('searching the cloud task list', () => {
  it('learns from the server that it can search, and not before', async () => {
    activateCloudAccount('user_1');
    mockListRuns.mockResolvedValueOnce({ runs: [cloudRun()], nextCursor: null });
    await useCloudTaskStore.getState().load('initial');
    expect(useCloudTaskStore.getState().searchAvailable).toBe(false);

    mockListRuns.mockResolvedValueOnce({
      runs: [cloudRun()],
      nextCursor: null,
      searchSupported: true,
    });
    await useCloudTaskStore.getState().load('refresh');
    expect(useCloudTaskStore.getState().searchAvailable).toBe(true);
  });

  it('reloads page one with the text and the current filter, replacing the list', async () => {
    activateCloudAccount('user_1');
    const all = cloudRun({ id: 'a' });
    const found = cloudRun({ id: 'b' });
    mockListRuns.mockResolvedValueOnce({ runs: [all], nextCursor: 'c1', searchSupported: true });
    await useCloudTaskStore.getState().load('initial');
    useCloudTaskStore.setState({ filter: 'blocked' });
    mockListRuns.mockResolvedValueOnce({ runs: [found], nextCursor: null, searchSupported: true });

    useCloudTaskStore.getState().setSearchQuery('  invoice  ');
    expect(useCloudTaskStore.getState().runs).toEqual([]);
    expect(useCloudTaskStore.getState().status).toBe('loading');
    await settle();

    expect(mockListRuns).toHaveBeenLastCalledWith(
      expect.objectContaining({ states: cloudRunFilterStates('blocked'), q: 'invoice' }),
    );
    expect(mockListRuns.mock.calls.at(-1)?.[0]).not.toHaveProperty('cursor');
    expect(useCloudTaskStore.getState().runs).toEqual([found]);
    expect(useCloudTaskStore.getState().searchQuery).toBe('invoice');
    expect(useCloudTaskStore.getState().status).toBe('loaded');
  });

  it('keeps the text on later pages and on refreshes', async () => {
    activateCloudAccount('user_1');
    mockListRuns.mockResolvedValue({
      runs: [cloudRun({ id: 'a' })],
      nextCursor: 'c1',
      searchSupported: true,
    });
    useCloudTaskStore.getState().setSearchQuery('invoice');
    await settle();

    mockListRuns.mockResolvedValueOnce({
      runs: [cloudRun({ id: 'b' })],
      nextCursor: null,
      searchSupported: true,
    });
    await useCloudTaskStore.getState().loadMore();
    expect(mockListRuns).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'c1', q: 'invoice' }),
    );

    await useCloudTaskStore.getState().load('refresh');
    expect(mockListRuns).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'invoice' }));
  });

  it('restores the whole list when the text is cleared', async () => {
    activateCloudAccount('user_1');
    mockListRuns.mockResolvedValue({ runs: [], nextCursor: null, searchSupported: true });
    useCloudTaskStore.getState().setSearchQuery('invoice');
    await settle();

    useCloudTaskStore.getState().setSearchQuery('   ');
    await settle();

    expect(mockListRuns.mock.calls.at(-1)?.[0]).not.toHaveProperty('q');
    expect(useCloudTaskStore.getState().searchQuery).toBe('');
  });

  it('does not reload for text that trims to the same query', async () => {
    activateCloudAccount('user_1');
    mockListRuns.mockResolvedValue({ runs: [], nextCursor: null, searchSupported: true });
    useCloudTaskStore.getState().setSearchQuery('invoice');
    await settle();
    mockListRuns.mockClear();

    useCloudTaskStore.getState().setSearchQuery('invoice ');
    await settle();

    expect(mockListRuns).not.toHaveBeenCalled();
  });

  it('shows a failed search as an error the person can retry', async () => {
    activateCloudAccount('user_1');
    mockListRuns.mockRejectedValueOnce(new Error('offline'));

    useCloudTaskStore.getState().setSearchQuery('invoice');
    await settle();

    expect(useCloudTaskStore.getState().status).toBe('error');
    expect(useCloudTaskStore.getState().searchQuery).toBe('invoice');

    mockListRuns.mockResolvedValueOnce({
      runs: [cloudRun()],
      nextCursor: null,
      searchSupported: true,
    });
    await useCloudTaskStore.getState().load('initial');
    expect(mockListRuns).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'invoice' }));
    expect(useCloudTaskStore.getState().status).toBe('loaded');
  });

  it('drops the search and lists everything when the server stops answering it', async () => {
    activateCloudAccount('user_1');
    const everything = cloudRun({ id: 'everything' });
    mockListRuns
      .mockResolvedValueOnce({ runs: [everything], nextCursor: null })
      .mockResolvedValueOnce({ runs: [everything], nextCursor: null });

    useCloudTaskStore.getState().setSearchQuery('invoice');
    await settle();

    expect(mockListRuns.mock.calls[0][0]).toHaveProperty('q', 'invoice');
    expect(mockListRuns.mock.calls[1][0]).not.toHaveProperty('q');
    expect(useCloudTaskStore.getState().searchQuery).toBe('');
    expect(useCloudTaskStore.getState().searchAvailable).toBe(false);
    expect(useCloudTaskStore.getState().runs).toEqual([everything]);
  });

  it('forgets the search and what the server said when the account changes', async () => {
    activateCloudAccount('user_1');
    mockListRuns.mockResolvedValue({ runs: [], nextCursor: null, searchSupported: true });
    useCloudTaskStore.getState().setSearchQuery('invoice');
    await settle();

    useCloudTaskStore.getState().reset();

    expect(useCloudTaskStore.getState().searchQuery).toBe('');
    expect(useCloudTaskStore.getState().searchAvailable).toBe(false);
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

  it('keeps the end of a long transcript from a line start with its code fences balanced', async () => {
    activateCloudAccount('user_1');
    const code = Array.from(
      { length: 200 },
      (_, index) => `    value_${index} = compute(${index})`,
    );
    const full = ['Here is the script:', '```python', ...code, '```', 'All done.'].join('\n');
    followsWith(
      snapshot(cloudRun({ state: 'completed' }), [
        envelope({ type: 'text-delta', delta: full }, 0),
      ]),
    );

    await useCloudTaskStore.getState().openRun(RUN_ID);

    const transcript = useCloudTaskStore.getState().detail?.transcript ?? '';
    expect(full.length).toBeGreaterThan(4_000);
    expect(transcript.length).toBeLessThanOrEqual(4_000);
    expect(full.endsWith(transcript)).toBe(true);
    expect(full[full.length - transcript.length - 1]).toBe('\n');
    const fences = transcript.split('\n').filter((line) => /^\s*(```|~~~)/.test(line));
    expect(fences.length % 2).toBe(0);
    expect(transcript).toContain('All done.');
  });

  it('keeps a code block that is still being written as code behind an earlier closed block', async () => {
    activateCloudAccount('user_1');
    const intro = Array.from(
      { length: 100 },
      (_, index) => `Intro paragraph line number ${index}.`,
    );
    const sample = Array.from({ length: 10 }, (_, index) => `const sample${index} = ${index};`);
    const prose = Array.from({ length: 30 }, (_, index) => `Explanation sentence ${index} here.`);
    const script = Array.from({ length: 15 }, (_, index) => `step_${index} = run(${index})`);
    const streaming = [...intro, '```ts', ...sample, '```', ...prose, '```python', ...script].join(
      '\n',
    );
    const pages = [
      snapshot(cloudRun({ state: 'running' }), [
        envelope({ type: 'text-delta', delta: streaming }, 0),
      ]),
      snapshot(cloudRun({ state: 'completed' }), [
        envelope({ type: 'text-delta', delta: '\n```\nAll done.' }, 1),
      ]),
    ];
    const fenceLines = (text: string) =>
      text.split('\n').filter((line) => /^\s*(```|~~~)/.test(line));
    const seen: string[] = [];
    mockFollowRun.mockImplementation(
      async (_runId: string, options: { onSnapshot?: (p: CloudAgentRunSnapshotPage) => void }) => {
        for (const page of pages) {
          await options.onSnapshot?.(page);
          seen.push(useCloudTaskStore.getState().detail?.transcript ?? '');
        }
        return { run: pages[1].run, lastSequence: 1 };
      },
    );

    await useCloudTaskStore.getState().openRun(RUN_ID);

    expect(streaming.length).toBeGreaterThan(4_000);
    expect(streaming.endsWith(seen[0])).toBe(true);
    expect(fenceLines(seen[0])).toEqual(['```ts', '```', '```python']);
    expect(seen[0]).toContain(prose[0]);
    const settled = useCloudTaskStore.getState().detail?.transcript ?? '';
    expect(fenceLines(settled)).toEqual(['```ts', '```', '```python', '```']);
    expect(settled.endsWith(`${script[script.length - 1]}\n\`\`\`\nAll done.`)).toBe(true);
  });

  it('keeps drawing as code a long block cut before its opening line', async () => {
    activateCloudAccount('user_1');
    const code = Array.from(
      { length: 200 },
      (_, index) => `    value_${index} = compute(${index})`,
    );
    const streaming = ['Here is the script:', '```python', ...code].join('\n');
    followsWith(
      snapshot(cloudRun({ state: 'running' }), [
        envelope({ type: 'text-delta', delta: streaming }, 0),
      ]),
    );

    await useCloudTaskStore.getState().openRun(RUN_ID);

    const transcript = useCloudTaskStore.getState().detail?.transcript ?? '';
    const [first, ...rest] = transcript.split('\n');
    expect(first).toBe('```python');
    expect(streaming.endsWith(rest.join('\n'))).toBe(true);
    expect(rest[rest.length - 1]).toBe(code[code.length - 1]);
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
    expect(useCloudTaskStore.getState().detail?.error).toBe('This task could not be opened');
  });

  it.each([403, 404, 410])(
    'says plainly that a run answering %i is no longer available',
    async (status) => {
      activateCloudAccount('user_1');
      mockFollowRun.mockRejectedValueOnce(new ManagedCloudAgentRunHttpError('gone', status));

      await useCloudTaskStore.getState().openRun(RUN_ID);

      expect(useCloudTaskStore.getState().detail?.status).toBe('error');
      expect(useCloudTaskStore.getState().detail?.error).toBe('This task is no longer available');
    },
  );
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

describe('pausing and resuming a cloud run', () => {
  it('pauses the open run and shows it paused', async () => {
    activateCloudAccount('user_1');
    followsWith(snapshot(cloudRun({ state: 'running' })));
    await useCloudTaskStore.getState().openRun(RUN_ID);

    mockPauseRun.mockResolvedValueOnce(cloudRun({ state: 'paused' }));
    await useCloudTaskStore.getState().pauseRun();

    expect(mockPauseRun).toHaveBeenCalledWith(RUN_ID, expect.anything());
    expect(useCloudTaskStore.getState().detail?.run?.state).toBe('paused');
    expect(useCloudTaskStore.getState().detail?.pendingAction).toBeNull();
  });

  it('resumes a paused run and follows it again', async () => {
    activateCloudAccount('user_1');
    followsWith(snapshot(cloudRun({ state: 'paused' })));
    await useCloudTaskStore.getState().openRun(RUN_ID);

    mockResumePausedRun.mockResolvedValueOnce(undefined);
    followsWith(snapshot(cloudRun({ state: 'running' })));
    await useCloudTaskStore.getState().resumeRun();

    expect(mockResumePausedRun).toHaveBeenCalledWith(RUN_ID, expect.anything());
    expect(useCloudTaskStore.getState().detail?.run?.state).toBe('running');
  });

  it('says so when a resume is refused', async () => {
    activateCloudAccount('user_1');
    followsWith(snapshot(cloudRun({ state: 'paused' })));
    await useCloudTaskStore.getState().openRun(RUN_ID);

    mockResumePausedRun.mockRejectedValueOnce(new Error('HTTP 500'));
    await useCloudTaskStore.getState().resumeRun();

    expect(useCloudTaskStore.getState().detail?.error).toBe('This task could not be resumed');
    expect(useCloudTaskStore.getState().detail?.pendingAction).toBeNull();
  });
});

describe('list requests that no longer own the list', () => {
  type Page = { runs: CloudAgentRun[]; nextCursor: string | null };

  it('ignores a first page requested for a filter that is no longer selected', async () => {
    activateCloudAccount('user_1');
    const allPage = deferred<Page>();
    const blockedPage = deferred<Page>();
    mockListRuns.mockReturnValueOnce(allPage.promise).mockReturnValueOnce(blockedPage.promise);

    const pending = useCloudTaskStore.getState().load('initial');
    useCloudTaskStore.getState().setFilter('blocked');
    blockedPage.resolve({ runs: [cloudRun({ id: 'blocked-1' })], nextCursor: 'blocked-cursor' });
    await settle();
    allPage.resolve({ runs: [cloudRun({ id: 'all-1' })], nextCursor: 'all-cursor' });
    await pending;
    await settle();

    const state = useCloudTaskStore.getState();
    expect(state.filter).toBe('blocked');
    expect(state.runs.map((run) => run.id)).toEqual(['blocked-1']);
    expect(state.nextCursor).toBe('blocked-cursor');
  });

  it('keeps the latest request when the filter returns to the one it started on', async () => {
    activateCloudAccount('user_1');
    const firstAll = deferred<Page>();
    const blocked = deferred<Page>();
    const secondAll = deferred<Page>();
    mockListRuns
      .mockReturnValueOnce(firstAll.promise)
      .mockReturnValueOnce(blocked.promise)
      .mockReturnValueOnce(secondAll.promise);

    const pending = useCloudTaskStore.getState().load('initial');
    useCloudTaskStore.getState().setFilter('blocked');
    useCloudTaskStore.getState().setFilter('all');
    secondAll.resolve({ runs: [cloudRun({ id: 'all-new' })], nextCursor: 'all-new-cursor' });
    await settle();
    firstAll.resolve({ runs: [cloudRun({ id: 'all-old' })], nextCursor: 'all-old-cursor' });
    blocked.resolve({ runs: [cloudRun({ id: 'blocked-1' })], nextCursor: 'blocked-cursor' });
    await pending;
    await settle();

    const state = useCloudTaskStore.getState();
    expect(state.filter).toBe('all');
    expect(state.runs.map((run) => run.id)).toEqual(['all-new']);
    expect(state.nextCursor).toBe('all-new-cursor');
  });

  it('drops a continuation page that was requested before the filter changed', async () => {
    activateCloudAccount('user_1');
    mockListRuns.mockResolvedValueOnce({
      runs: [cloudRun({ id: 'all-1' })],
      nextCursor: 'all-cursor',
    });
    await useCloudTaskStore.getState().load('initial');

    const continuation = deferred<Page>();
    mockListRuns.mockReturnValueOnce(continuation.promise);
    const pending = useCloudTaskStore.getState().loadMore();

    mockListRuns.mockResolvedValueOnce({
      runs: [cloudRun({ id: 'blocked-1' })],
      nextCursor: 'blocked-cursor',
    });
    useCloudTaskStore.getState().setFilter('blocked');
    await settle();
    continuation.resolve({ runs: [cloudRun({ id: 'all-2' })], nextCursor: 'all-cursor-2' });
    await pending;

    const state = useCloudTaskStore.getState();
    expect(state.runs.map((run) => run.id)).toEqual(['blocked-1']);
    expect(state.nextCursor).toBe('blocked-cursor');
    expect(state.loadingMore).toBe(false);
  });

  it('drops a continuation page that a newer first page has replaced', async () => {
    activateCloudAccount('user_1');
    mockListRuns.mockResolvedValueOnce({
      runs: [cloudRun({ id: 'old-1' })],
      nextCursor: 'old-cursor',
    });
    await useCloudTaskStore.getState().load('initial');

    const continuation = deferred<Page>();
    mockListRuns.mockReturnValueOnce(continuation.promise);
    const pending = useCloudTaskStore.getState().loadMore();

    mockListRuns.mockResolvedValueOnce({
      runs: [cloudRun({ id: 'fresh-1' })],
      nextCursor: 'fresh-cursor',
    });
    await useCloudTaskStore.getState().load('refresh');
    continuation.resolve({ runs: [cloudRun({ id: 'old-2' })], nextCursor: 'old-cursor-2' });
    await pending;

    const state = useCloudTaskStore.getState();
    expect(state.runs.map((run) => run.id)).toEqual(['fresh-1']);
    expect(state.nextCursor).toBe('fresh-cursor');
    expect(state.loadingMore).toBe(false);
  });
});

describe('actions that finish after the detail was left', () => {
  it('does not reopen a dismissed run when its approval succeeds', async () => {
    activateCloudAccount('user_1');
    followsWith(snapshot(pendingApprovalRun()));
    await useCloudTaskStore.getState().openRun(RUN_ID);

    const decision = deferred<void>();
    mockResumeRun.mockReturnValueOnce(decision.promise);
    const pending = useCloudTaskStore.getState().resolveApproval('approved');
    useCloudTaskStore.getState().closeRun();
    decision.resolve();
    await pending;

    expect(useCloudTaskStore.getState().detail).toBeNull();
    expect(mockFollowRun).toHaveBeenCalledTimes(1);
  });

  it('keeps a newly selected run when an earlier approval succeeds', async () => {
    activateCloudAccount('user_1');
    followsWith(snapshot(pendingApprovalRun()));
    await useCloudTaskStore.getState().openRun(RUN_ID);

    const decision = deferred<void>();
    mockResumeRun.mockReturnValueOnce(decision.promise);
    const pending = useCloudTaskStore.getState().resolveApproval('approved');
    followsWith(snapshot(cloudRun({ id: 'run-b', state: 'running' })));
    await useCloudTaskStore.getState().openRun('run-b');
    decision.resolve();
    await pending;

    expect(useCloudTaskStore.getState().detail?.runId).toBe('run-b');
    expect(mockFollowRun).toHaveBeenCalledTimes(2);
  });

  it('does not reopen a dismissed run when its connector answer succeeds', async () => {
    activateCloudAccount('user_1');
    followsWith(
      snapshot(
        cloudRun({
          state: 'awaiting_input',
          pendingInput: {
            requestedAt: new Date(NOW).toISOString(),
            toolCalls: [
              {
                toolCallId: 'call_1',
                name: 'lookup',
                connectorId: 'connector_1',
                round: 0,
                inputRequests: {},
              },
            ],
          },
        }),
      ),
    );
    await useCloudTaskStore.getState().openRun(RUN_ID);

    const answer = deferred<void>();
    mockAnswerRunInput.mockReturnValueOnce(answer.promise);
    const pending = useCloudTaskStore
      .getState()
      .answerInput([{ toolCallId: 'call_1', responses: { answer: 'yes' } }]);
    useCloudTaskStore.getState().closeRun();
    answer.resolve();
    await pending;

    expect(useCloudTaskStore.getState().detail).toBeNull();
    expect(mockFollowRun).toHaveBeenCalledTimes(1);
  });
});
