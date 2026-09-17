import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeveloperSessionList } from '@agiworkforce/local-runtime-contract';
import {
  parseRemoteCodeEvent,
  parseRemoteCodeSessions,
  parseRemoteCodeSnapshot,
} from '@agiworkforce/types';
import {
  createCodeRemoteController,
  type CodeRemoteDependencies,
} from '../remote/codeRemoteController';
import type { DeveloperSessionActivity } from '../runtime/developerSessionService';

const NOW = Date.parse('2026-09-17T12:00:00.000Z');
const SENT_AT = new Date(NOW).toISOString();

function session(overrides: Partial<DeveloperSessionActivity['transcript']['session']> = {}) {
  return {
    id: 'thread-1',
    rootId: 'root-1',
    title: 'Fix retry backoff',
    cwd: '/work/api',
    model: null,
    provider: null,
    trustMode: 'unknown' as const,
    status: 'idle' as const,
    createdAt: SENT_AT,
    updatedAt: SENT_AT,
    origin: 'desktop' as const,
    ...overrides,
  };
}

function activity(overrides: Partial<DeveloperSessionActivity> = {}): DeveloperSessionActivity {
  return {
    transcript: {
      session: session(),
      messages: [
        { role: 'user', text: 'make retries back off' },
        { role: 'tool', text: 'ignored' },
        { role: 'assistant', text: 'Working on it.' },
      ],
      truncated: false,
    },
    branch: 'main',
    fileChanges: [
      {
        path: 'src/retry.ts',
        kind: 'modified',
        tool: 'edit_file',
        toolCallId: 'call-1',
        changedAt: SENT_AT,
      },
      {
        path: 'src/retry.test.ts',
        kind: 'created',
        tool: 'write_file',
        toolCallId: 'call-2',
        changedAt: SENT_AT,
      },
    ],
    activeTurn: null,
    ...overrides,
  };
}

const GIT_DIFF = [
  'diff --git a/src/retry.ts b/src/retry.ts',
  '--- a/src/retry.ts',
  '+++ b/src/retry.ts',
  '@@ -1 +1 @@',
  '-const attempts = 3;',
  '+const attempts = 5;',
].join('\n');

let sent: Array<{ action: string; payload: Record<string, unknown> }>;
let deps: CodeRemoteDependencies;

function request(action: string, extra: Record<string, unknown> = {}) {
  return { version: 1, requestId: `req-${Math.random()}`, sentAt: SENT_AT, ...extra };
}

function lastEvent(type: string) {
  return sent
    .filter((entry) => entry.action === 'code.session.event')
    .map((entry) => entry.payload['event'] as Record<string, unknown>)
    .filter((event) => event['type'] === type)
    .at(-1);
}

beforeEach(() => {
  sent = [];
  deps = {
    send: vi.fn(async (action, payload) => {
      const parse =
        action === 'code.sessions'
          ? parseRemoteCodeSessions
          : action === 'code.session.snapshot'
            ? parseRemoteCodeSnapshot
            : parseRemoteCodeEvent;
      expect(parse(payload), `${action} must parse on the phone`).not.toBeNull();
      sent.push({ action, payload });
      return true;
    }),
    listSessions: vi.fn(async (): Promise<DeveloperSessionList> => ({
      groups: [
        {
          rootId: 'root-1',
          name: 'api',
          path: '/work/api',
          branch: 'main',
          sessions: [session({ status: 'running' })],
        },
        {
          rootId: 'root-2',
          name: 'web',
          path: '/work/web',
          branch: null,
          sessions: [],
          unavailable: { message: 'The AGI CLI is not on this app PATH.', hint: '' },
        },
      ],
    })),
    readActivity: vi.fn(async () => activity()),
    startTurn: vi.fn(async () => ({ turnId: 'turn-guided' })),
    interruptTurn: vi.fn(async () => true),
    answerApproval: vi.fn(async () => true),
    readDiff: vi.fn(async () => GIT_DIFF),
    now: () => NOW,
  };
});

describe('remote control of a developer session', () => {
  it('lists every session the host serves and names folders it cannot open', async () => {
    const controller = createCodeRemoteController(deps);
    expect(await controller.handleControl('code.sessions.list', request('list'))).toBe(true);

    expect(sent[0]).toMatchObject({
      action: 'code.sessions',
      payload: {
        sessions: [
          {
            rootId: 'root-1',
            threadId: 'thread-1',
            folder: 'api',
            branch: 'main',
            status: 'running',
          },
        ],
        unavailable: [{ folder: 'web', message: 'The AGI CLI is not on this app PATH.' }],
      },
    });
  });

  it('attaches with the transcript, generated files and a diff for each modified file', async () => {
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    const snapshot = sent.find((entry) => entry.action === 'code.session.snapshot')?.payload;
    expect(snapshot).toMatchObject({
      title: 'Fix retry backoff',
      messages: [
        { role: 'user', text: 'make retries back off' },
        { role: 'assistant', text: 'Working on it.' },
      ],
      fileChanges: [
        { path: 'src/retry.ts', kind: 'modified' },
        { path: 'src/retry.test.ts', kind: 'created' },
      ],
    });
    expect(snapshot).not.toHaveProperty('diffs');
    expect(lastEvent('diff')).toEqual({
      type: 'diff',
      diff: { path: 'src/retry.ts', patch: GIT_DIFF, truncated: false },
    });
    expect(deps.readDiff).toHaveBeenCalledWith('root-1', ['src/retry.ts']);
    expect(controller.attachedThreadCount()).toBe(1);
  });

  it('joins a running turn mid-flight with its partial output and pending approval', async () => {
    deps.readActivity = vi.fn(async () =>
      activity({
        activeTurn: {
          turnId: 'turn-7',
          partialResponse: 'Editing retry.ts',
          pendingApprovals: [{ requestId: 'ap-1', summary: 'Run pnpm test', detail: 'shell' }],
        },
      }),
    );
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    expect(sent.find((entry) => entry.action === 'code.session.snapshot')?.payload).toMatchObject({
      status: 'awaiting_approval',
      activeTurnId: 'turn-7',
      partialResponse: 'Editing retry.ts',
      pendingApprovals: [{ turnId: 'turn-7', requestId: 'ap-1', summary: 'Run pnpm test' }],
    });

    await controller.handleControl(
      'code.approval.respond',
      request('approve', {
        rootId: 'root-1',
        threadId: 'thread-1',
        turnId: 'turn-7',
        approvalRequestId: 'ap-1',
        approved: true,
      }),
    );
    expect(deps.answerApproval).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-7',
      requestId: 'ap-1',
      approved: true,
    });
  });

  it('never answers an approval the host is not waiting on', async () => {
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.approval.respond',
      request('approve', {
        rootId: 'root-1',
        threadId: 'thread-1',
        turnId: 'turn-7',
        approvalRequestId: 'forged',
        approved: true,
      }),
    );
    expect(deps.answerApproval).not.toHaveBeenCalled();
  });

  it('relays tool diffs and test results as the turn runs', async () => {
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );
    sent = [];

    await controller.handleSessionEvent('root-1', {
      type: 'tool-started',
      threadId: 'thread-1',
      turnId: 'turn-1',
      toolCallId: 'call-edit',
      name: 'edit_file',
      summary: 'src/retry.ts',
    });
    await controller.handleSessionEvent('root-1', {
      type: 'tool-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      toolCallId: 'call-edit',
      name: 'edit_file',
      output: `Edited.\n${GIT_DIFF}`,
      isError: false,
    });
    await controller.handleSessionEvent('root-1', {
      type: 'tool-started',
      threadId: 'thread-1',
      turnId: 'turn-1',
      toolCallId: 'call-test',
      name: 'shell',
      summary: 'pnpm exec vitest run src/retry.test.ts',
    });
    await controller.handleSessionEvent('root-1', {
      type: 'tool-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      toolCallId: 'call-test',
      name: 'shell',
      output: ' Tests  1 failed | 4 passed (5)',
      isError: true,
    });

    expect(lastEvent('diff')).toMatchObject({ diff: { path: 'src/retry.ts' } });
    expect(lastEvent('test-run')).toMatchObject({
      testRun: {
        command: 'pnpm exec vitest run src/retry.test.ts',
        status: 'failed',
        passed: 4,
        failed: 1,
      },
    });
  });

  it('sends the phone the diff the runtime states, not one scraped from tool output', async () => {
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );
    sent = [];

    await controller.handleSessionEvent('root-1', {
      type: 'turn-diff',
      threadId: 'thread-1',
      turnId: 'turn-1',
      unifiedDiff: GIT_DIFF,
      paths: ['src/retry.ts'],
    });

    expect(lastEvent('diff')).toMatchObject({
      diff: { path: 'src/retry.ts', truncated: false },
    });
  });

  it('sends nothing for a session no phone is attached to', async () => {
    const controller = createCodeRemoteController(deps);
    await controller.handleSessionEvent('root-1', {
      type: 'output-delta',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'secret progress',
    });
    expect(sent).toEqual([]);
  });

  it('starts a turn with guidance when the session is idle', async () => {
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.steer',
      request('steer', { rootId: 'root-1', threadId: 'thread-1', text: 'use the retry helper' }),
    );
    expect(deps.startTurn).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      text: 'use the retry helper',
    });
  });

  it('queues guidance into the next turn while one runs, and interrupts only when asked', async () => {
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );
    await controller.handleSessionEvent('root-1', {
      type: 'turn-started',
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    await controller.handleControl(
      'code.session.steer',
      request('steer', { rootId: 'root-1', threadId: 'thread-1', text: 'skip the docs' }),
    );
    expect(deps.startTurn).not.toHaveBeenCalled();
    expect(deps.interruptTurn).not.toHaveBeenCalled();
    expect(lastEvent('guidance-queued')).toMatchObject({ queuedGuidance: ['skip the docs'] });

    await controller.handleControl(
      'code.session.steer',
      request('steer', {
        rootId: 'root-1',
        threadId: 'thread-1',
        text: 'and stop editing tests',
        interrupt: true,
      }),
    );
    expect(deps.interruptTurn).toHaveBeenCalledWith('root-1', 'thread-1', 'turn-1');

    await controller.handleSessionEvent('root-1', {
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      outcome: 'interrupted',
      response: '',
      failure: null,
    });
    expect(deps.startTurn).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      text: 'skip the docs\n\nand stop editing tests',
    });
    expect(lastEvent('guidance-delivered')).toMatchObject({ turnId: 'turn-guided' });
  });

  it('ignores requests that fail validation', async () => {
    const controller = createCodeRemoteController(deps);
    expect(
      await controller.handleControl('code.session.steer', request('steer', { rootId: 'root-1' })),
    ).toBe(false);
    expect(await controller.handleControl('dispatch.task.create', request('x'))).toBe(false);
    expect(sent).toEqual([]);
  });

  it('keeps a snapshot inside the relay payload budget by dropping the oldest transcript first', async () => {
    deps.readActivity = vi.fn(async () =>
      activity({
        transcript: {
          session: session(),
          messages: Array.from({ length: 30 }, (_, index) => ({
            role: index % 2 === 0 ? 'user' : 'assistant',
            text: `${index}:${'"'.repeat(1_900)}`,
          })),
          truncated: false,
        },
      }),
    );
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    const snapshot = sent.find((entry) => entry.action === 'code.session.snapshot')?.payload;
    const messages = snapshot?.['messages'] as Array<{ text: string }>;
    expect(JSON.stringify(snapshot).length).toBeLessThanOrEqual(40_000);
    expect(messages.at(-1)?.text.startsWith('29:')).toBe(true);
    expect(messages.length).toBeLessThan(12);
  });
});
