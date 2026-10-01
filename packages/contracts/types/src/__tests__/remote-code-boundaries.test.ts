import { describe, expect, it } from 'vitest';
import {
  REMOTE_CODE_LIMITS,
  REMOTE_RESULT_SHORTENED_NOTE,
  clipRemoteResult,
  clipRemoteText,
  fitRemoteSnapshot,
  parseRemoteCodeEvent,
  parseRemoteCodeRequest,
  parseRemoteCodeSessions,
  parseRemoteCodeSnapshot,
  parseRemoteCodeStarted,
  parseRemoteCodeTranscript,
  type RemoteCodeSessionSnapshot,
} from '../remote-code';

const sentAt = '2026-09-30T12:00:00.000Z';
const request = {
  version: 1,
  requestId: 'request-1',
  sentAt,
  rootId: 'root-1',
  threadId: 'thread-1',
};
const snapshot: RemoteCodeSessionSnapshot = {
  action: 'code.session.snapshot',
  version: 1,
  rootId: 'root-1',
  threadId: 'thread-1',
  title: 'Review',
  status: 'idle',
  activeTurnId: null,
  partialResponse: '',
  messages: [],
  pendingApprovals: [],
  fileChanges: [],
  queuedGuidance: [],
  tools: [],
  syncedAt: sentAt,
};
const event = (value: unknown) =>
  parseRemoteCodeEvent({
    action: 'code.session.event',
    version: 1,
    rootId: 'root-1',
    threadId: 'thread-1',
    event: value,
    sentAt,
  });

describe('remote code request identity and pagination', () => {
  it('reads list, start, attachment and interruption with bounded identities', () => {
    expect(parseRemoteCodeRequest('code.sessions.list', request)).toEqual({
      action: 'code.sessions.list',
      version: 1,
      requestId: 'request-1',
      sentAt,
    });
    expect(
      parseRemoteCodeRequest('code.session.start', {
        ...request,
        text: ' Review the patch ',
        title: ' Draft ',
      }),
    ).toEqual({
      action: 'code.session.start',
      version: 1,
      requestId: 'request-1',
      sentAt,
      rootId: 'root-1',
      text: 'Review the patch',
      title: 'Draft',
    });
    for (const action of ['code.session.attach', 'code.session.detach'])
      expect(parseRemoteCodeRequest(action, request)).toEqual({ ...request, action });
    expect(parseRemoteCodeRequest('code.turn.interrupt', { ...request, turnId: 'turn-1' })).toEqual(
      { ...request, action: 'code.turn.interrupt', turnId: 'turn-1' },
    );
    expect(parseRemoteCodeRequest('code.session.history', request)).toEqual({
      ...request,
      action: 'code.session.history',
      before: null,
    });
    expect(parseRemoteCodeRequest('code.session.history', { ...request, before: 0 })).toEqual({
      ...request,
      action: 'code.session.history',
      before: 0,
    });
  });

  it.each([
    ['code.sessions.list', { ...request, requestId: '' }],
    ['code.sessions.list', { ...request, sentAt: 'invalid' }],
    ['code.session.start', { ...request, text: 'x', title: 1 }],
    [
      'code.session.start',
      { ...request, text: 'x', title: 'x'.repeat(REMOTE_CODE_LIMITS.titleLength + 1) },
    ],
    ['code.session.start', { ...request, text: 'x'.repeat(REMOTE_CODE_LIMITS.taskLength + 1) }],
    ['code.session.attach', { ...request, threadId: '' }],
    ['code.turn.interrupt', request],
    ['code.session.history', { ...request, before: -1 }],
    ['code.session.history', { ...request, before: 0.5 }],
  ])('refuses malformed requests %#', (action, value) => {
    expect(parseRemoteCodeRequest(action as string, value)).toBeNull();
  });

  it('requires exactly one of a started thread or a start error', () => {
    const base = {
      action: 'code.session.started',
      version: 1,
      requestId: 'request-1',
      rootId: 'root-1',
      sentAt,
    };
    expect(parseRemoteCodeStarted({ ...base, threadId: 'thread-1' })).toEqual({
      ...base,
      threadId: 'thread-1',
      error: null,
    });
    expect(
      parseRemoteCodeStarted({ ...base, threadId: null, error: 'Permission refused' }),
    ).toEqual({ ...base, threadId: null, error: 'Permission refused' });
    for (const patch of [
      { threadId: null },
      { threadId: 'thread-1', error: 'Permission refused' },
      { threadId: 'thread-1', error: 1 },
    ])
      expect(parseRemoteCodeStarted({ ...base, ...patch })).toBeNull();
    expect(parseRemoteCodeStarted(null)).toBeNull();
  });

  it('preserves indexed history and refuses invalid indices or roles', () => {
    const page = {
      action: 'code.session.transcript',
      version: 1,
      rootId: 'root-1',
      threadId: 'thread-1',
      before: 5,
      messages: [{ index: 4, role: 'assistant', text: 'Draft ready' }],
      hasEarlier: true,
      syncedAt: sentAt,
    };
    expect(parseRemoteCodeTranscript(page)).toEqual(page);
    expect(parseRemoteCodeTranscript({ ...page, before: null, messages: [] })).toEqual({
      ...page,
      before: null,
      messages: [],
    });
    for (const patch of [
      { before: -1 },
      { messages: [{ index: -1, role: 'assistant', text: 'x' }] },
      { messages: [{ index: 1, role: 'system', text: 'x' }] },
      { hasEarlier: 'yes' },
    ])
      expect(parseRemoteCodeTranscript({ ...page, ...patch })).toBeNull();
    expect(parseRemoteCodeTranscript({ ...page, action: 'code.session.snapshot' })).toBeNull();
  });
});

describe('host snapshots and live events', () => {
  it('reads root availability and tool records without interpreting them as permission grants', () => {
    const root = { rootId: 'root-1', name: 'Workspace', branch: null, available: false };
    expect(
      parseRemoteCodeSessions({
        action: 'code.sessions',
        version: 1,
        sessions: [],
        roots: [root],
        unavailable: [],
        syncedAt: sentAt,
      })?.roots,
    ).toEqual([root]);
    expect(
      parseRemoteCodeSessions({
        action: 'code.sessions',
        version: 1,
        sessions: [],
        roots: [{ ...root, available: 'true' }],
        unavailable: [],
        syncedAt: sentAt,
      }),
    ).toBeNull();
    const tool = {
      toolCallId: 'call-1',
      name: 'read_file',
      summary: 'Read draft',
      state: 'done',
      output: 'Draft',
    };
    expect(parseRemoteCodeSnapshot({ ...snapshot, tools: [tool] })).toEqual({
      ...snapshot,
      tools: [tool],
    });
    for (const patch of [
      { tools: [{ ...tool, state: 'approved' }] },
      { fileChanges: [{ path: 'a.ts', tool: 'edit_file', kind: 'deleted', changedAt: sentAt }] },
      { pendingApprovals: [{ turnId: '', requestId: 'approval-1', summary: '', detail: '' }] },
    ])
      expect(parseRemoteCodeSnapshot({ ...snapshot, ...patch })).toBeNull();
  });

  it.each([
    { type: 'turn-started', turnId: 'turn-1' },
    { type: 'output-delta', turnId: 'turn-1', delta: 'Draft' },
    {
      type: 'tool-started',
      turnId: 'turn-1',
      toolCallId: 'call-1',
      name: 'read_file',
      summary: 'Read draft',
    },
    {
      type: 'tool-finished',
      turnId: 'turn-1',
      toolCallId: 'call-1',
      name: 'read_file',
      isError: false,
    },
    {
      type: 'tool-finished',
      turnId: 'turn-1',
      toolCallId: 'call-1',
      name: 'read_file',
      isError: true,
      output: 'Refused',
    },
    {
      type: 'approval-requested',
      turnId: 'turn-1',
      requestId: 'approval-1',
      summary: 'Publish draft',
      detail: 'Visible to others',
    },
    { type: 'approval-answered', requestId: 'approval-1', approved: false },
    { type: 'turn-finished', turnId: 'turn-1', outcome: 'interrupted', response: 'Stopped' },
    { type: 'guidance-queued', queuedGuidance: ['Review permissions'] },
    { type: 'guidance-delivered', turnId: 'turn-1', queuedGuidance: [] },
    { type: 'runtime-stopped', message: 'Connection closed' },
  ])('preserves a valid live event %#', (value) => {
    expect(event(value)?.event).toEqual(value);
  });

  it.each([
    null,
    { type: 'unknown' },
    { type: 'turn-started', turnId: '' },
    { type: 'output-delta', turnId: 'turn-1', delta: 1 },
    {
      type: 'tool-finished',
      turnId: 'turn-1',
      toolCallId: 'call-1',
      name: 'read_file',
      isError: 'false',
    },
    { type: 'approval-answered', requestId: 'approval-1', approved: 'true' },
    { type: 'turn-finished', turnId: 'turn-1', outcome: 'approved', response: '' },
    {
      type: 'guidance-queued',
      queuedGuidance: Array(REMOTE_CODE_LIMITS.queuedGuidance + 1).fill('x'),
    },
    { type: 'guidance-delivered', queuedGuidance: [] },
    { type: 'runtime-stopped', message: 1 },
    {
      type: 'test-run',
      testRun: {
        toolCallId: 'call-1',
        command: 'pnpm test',
        output: '',
        finishedAt: sentAt,
        status: 'passed',
        passed: -1,
        failed: 0,
        skipped: 0,
      },
    },
  ])('refuses malformed live events rather than inventing success %#', (value) => {
    expect(event(value)).toBeNull();
  });

  it('clips results visibly and drops oversized history without mutating the input snapshot', () => {
    expect(clipRemoteText('short', 5)).toEqual({ text: 'short', truncated: false });
    expect(clipRemoteText('abcdef', 3)).toEqual({ text: 'def', truncated: true });
    expect(clipRemoteResult('short', 5)).toBe('short');
    expect(clipRemoteResult('x'.repeat(200), REMOTE_RESULT_SHORTENED_NOTE.length + 4)).toBe(
      REMOTE_RESULT_SHORTENED_NOTE + 'xxxx',
    );
    const original: RemoteCodeSessionSnapshot = {
      ...snapshot,
      messages: [{ role: 'user', text: 'x'.repeat(REMOTE_CODE_LIMITS.payloadBytes) }],
      tools: [
        {
          toolCallId: 'call-1',
          name: 'read_file',
          summary: '',
          state: 'done',
          output: 'x'.repeat(REMOTE_CODE_LIMITS.payloadBytes),
        },
      ],
      fileChanges: [
        {
          path: 'x'.repeat(REMOTE_CODE_LIMITS.payloadBytes),
          kind: 'created',
          tool: 'write_file',
          changedAt: sentAt,
        },
      ],
      partialResponse: 'x'.repeat(REMOTE_CODE_LIMITS.payloadBytes),
    };
    const fitted = fitRemoteSnapshot(original);
    expect(fitted).toEqual(snapshot);
    expect(original.messages).toHaveLength(1);
    expect(original.tools).toHaveLength(1);
    expect(original.fileChanges).toHaveLength(1);
    expect(original.partialResponse).toHaveLength(REMOTE_CODE_LIMITS.payloadBytes);
  });
});
