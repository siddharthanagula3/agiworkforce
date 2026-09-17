import { ingestRemoteCodeControl, remoteCodeThreadKey, useRemoteCodeStore } from '../store';

const SENT_AT = '2026-09-17T12:00:00.000Z';
const KEY = remoteCodeThreadKey('root-1', 'thread-1');

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    action: 'code.session.snapshot',
    version: 1,
    rootId: 'root-1',
    threadId: 'thread-1',
    title: 'Fix retry',
    status: 'running',
    activeTurnId: 'turn-1',
    partialResponse: '',
    messages: [{ role: 'user', text: 'make retries back off' }],
    pendingApprovals: [],
    fileChanges: [{ path: 'src/new.ts', kind: 'created', tool: 'write_file', changedAt: SENT_AT }],
    queuedGuidance: [],
    syncedAt: SENT_AT,
    ...overrides,
  };
}

function event(liveEvent: Record<string, unknown>) {
  return {
    action: 'code.session.event',
    version: 1,
    rootId: 'root-1',
    threadId: 'thread-1',
    event: liveEvent,
    sentAt: SENT_AT,
  };
}

beforeEach(() => {
  useRemoteCodeStore.getState().reset();
});

describe('remote code store on the phone', () => {
  it('lists the sessions Desktop reports', () => {
    expect(
      ingestRemoteCodeControl('code.sessions', {
        action: 'code.sessions',
        version: 1,
        sessions: [
          {
            rootId: 'root-1',
            threadId: 'thread-1',
            title: 'Fix retry',
            folder: 'api',
            branch: 'main',
            status: 'awaiting_approval',
            model: null,
            updatedAt: SENT_AT,
          },
        ],
        unavailable: [],
        syncedAt: SENT_AT,
      }),
    ).toBe(true);
    expect(useRemoteCodeStore.getState().sessions[0]).toMatchObject({
      folder: 'api',
      status: 'awaiting_approval',
    });
  });

  it('follows a turn from snapshot through approval, diff, test run and completion', () => {
    ingestRemoteCodeControl('code.session.snapshot', snapshot());
    ingestRemoteCodeControl(
      'code.session.event',
      event({ type: 'output-delta', turnId: 'turn-1', delta: 'Editing retry.ts' }),
    );
    ingestRemoteCodeControl(
      'code.session.event',
      event({
        type: 'approval-requested',
        turnId: 'turn-1',
        requestId: 'ap-1',
        summary: 'Run pnpm test',
        detail: 'shell',
      }),
    );
    expect(useRemoteCodeStore.getState().threads[KEY]).toMatchObject({
      status: 'awaiting_approval',
      partialResponse: 'Editing retry.ts',
      pendingApprovals: [{ requestId: 'ap-1' }],
    });

    ingestRemoteCodeControl(
      'code.session.event',
      event({ type: 'approval-answered', requestId: 'ap-1', approved: true }),
    );
    ingestRemoteCodeControl(
      'code.session.event',
      event({
        type: 'diff',
        diff: { path: 'src/retry.ts', patch: '@@ -1 +1 @@\n-a\n+b', truncated: false },
      }),
    );
    ingestRemoteCodeControl(
      'code.session.event',
      event({
        type: 'test-run',
        testRun: {
          toolCallId: 'call-test',
          command: 'pnpm test',
          status: 'passed',
          passed: 5,
          failed: 0,
          skipped: null,
          output: 'Tests 5 passed',
          finishedAt: SENT_AT,
        },
      }),
    );
    ingestRemoteCodeControl(
      'code.session.event',
      event({ type: 'turn-finished', turnId: 'turn-1', outcome: 'completed', response: 'Done.' }),
    );

    const thread = useRemoteCodeStore.getState().threads[KEY];
    expect(thread).toMatchObject({
      status: 'idle',
      activeTurnId: null,
      pendingApprovals: [],
      diffs: [{ path: 'src/retry.ts' }],
      testRuns: [{ status: 'passed', passed: 5 }],
      fileChanges: [{ path: 'src/new.ts', kind: 'created' }],
    });
    expect(thread?.messages.at(-1)).toEqual({ role: 'assistant', text: 'Done.' });
  });

  it('keeps diffs and test runs across a fresh snapshot, which never carries them', () => {
    ingestRemoteCodeControl('code.session.snapshot', snapshot());
    ingestRemoteCodeControl(
      'code.session.event',
      event({ type: 'diff', diff: { path: 'a.ts', patch: '@@', truncated: false } }),
    );
    ingestRemoteCodeControl(
      'code.session.snapshot',
      snapshot({ status: 'idle', activeTurnId: null }),
    );
    expect(useRemoteCodeStore.getState().threads[KEY]?.diffs).toHaveLength(1);
  });

  it('ignores malformed messages and events for sessions it never opened', () => {
    expect(
      ingestRemoteCodeControl('code.session.snapshot', { action: 'code.session.snapshot' }),
    ).toBe(false);
    ingestRemoteCodeControl('code.session.event', event({ type: 'turn-started', turnId: 't' }));
    expect(useRemoteCodeStore.getState().threads).toEqual({});
  });

  it('shows why the host stopped', () => {
    ingestRemoteCodeControl('code.session.snapshot', snapshot());
    ingestRemoteCodeControl(
      'code.session.event',
      event({ type: 'runtime-stopped', message: 'The AGI CLI exited.' }),
    );
    expect(useRemoteCodeStore.getState().threads[KEY]).toMatchObject({
      status: 'failed',
      hostMessage: 'The AGI CLI exited.',
    });
  });
});
