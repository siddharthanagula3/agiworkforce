import { isCredentialPath } from '@agiworkforce/local-runtime-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DeveloperSessionEvent,
  DeveloperSessionList,
} from '@agiworkforce/local-runtime-contract';
import {
  REMOTE_CODE_LIMITS,
  parseRemoteCodeEvent,
  parseRemoteCodeSessions,
  parseRemoteCodeSnapshot,
} from '@agiworkforce/types';
import {
  RemoteCommandRefused,
  WITHHELD_DIFF,
  createCodeRemoteController,
  type CodeRemoteDependencies,
  type DeveloperSessionActivity,
} from '@agiworkforce/utils/remote-control';

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
      activeTurn: null,
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
    answerApproval: vi.fn(async () => ({ status: 'applied' as const })),
    answerQuestion: vi.fn(async () => undefined),
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
        unavailable: [
          {
            folder: 'web',
            message: 'AGI Code could not open this folder on the computer. Check it there.',
          },
        ],
      },
    });
  });

  it('marks a cloud session as cloud in the phone list', async () => {
    deps.listSessions = vi.fn(async (): Promise<DeveloperSessionList> => ({
      groups: [
        {
          rootId: 'root-1',
          name: 'api',
          path: '/work/api',
          branch: 'main',
          sessions: [session({ id: 'cloud:5f1c', cwd: '', location: 'cloud' })],
        },
      ],
    }));
    const controller = createCodeRemoteController(deps);
    expect(await controller.handleControl('code.sessions.list', request('list'))).toBe(true);

    expect(sent[0]).toMatchObject({
      action: 'code.sessions',
      payload: { sessions: [{ threadId: 'cloud:5f1c', location: 'cloud' }] },
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

  it('does not attach a session the phone was refused, and sends nothing from it afterwards', async () => {
    deps.readActivity = vi.fn(async () => {
      throw new RemoteCommandRefused('This device has not been allowed to run commands there.');
    });
    const controller = createCodeRemoteController(deps);

    await expect(
      controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      ),
    ).rejects.toBeInstanceOf(RemoteCommandRefused);
    await controller.handleSessionEvent('root-1', {
      type: 'output-delta',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'private output',
    });

    expect(controller.attachedThreadCount()).toBe(0);
    expect(sent).toEqual([]);
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
      decision: 'approve_once',
    });
  });

  describe('an allow the computer will not take from a phone alone', () => {
    async function attachWithApproval() {
      deps.readActivity = vi.fn(async () =>
        activity({
          activeTurn: {
            turnId: 'turn-7',
            partialResponse: '',
            pendingApprovals: [{ requestId: 'ap-1', summary: 'Force push', detail: 'git' }],
          },
        }),
      );
      const controller = createCodeRemoteController(deps);
      await controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      );
      sent = [];
      return controller;
    }

    const approve = () =>
      request('approve', {
        rootId: 'root-1',
        threadId: 'thread-1',
        turnId: 'turn-7',
        approvalRequestId: 'ap-1',
        approved: true,
      });

    const holds = () =>
      sent
        .filter((entry) => entry.action === 'code.session.event')
        .map((entry) => entry.payload['event'] as Record<string, unknown>)
        .filter((event) => event['type'] === 'approval-held');

    it('tells the phone it is waiting at the computer, then how that ended', async () => {
      let settle: (result: { allowed: boolean; message: string }) => void = () => undefined;
      deps.answerApproval = vi.fn(async () => ({
        status: 'held' as const,
        message: 'This needs to be allowed at your computer.',
        settled: new Promise<{ allowed: boolean; message: string }>((resolve) => {
          settle = resolve;
        }),
      }));
      const controller = await attachWithApproval();

      await controller.handleControl('code.approval.respond', approve());
      expect(holds()).toEqual([
        {
          type: 'approval-held',
          requestId: 'ap-1',
          status: 'waiting',
          message: 'This needs to be allowed at your computer.',
        },
      ]);

      settle({ allowed: false, message: 'Not allowed at your computer.' });
      await vi.waitFor(() => expect(holds()).toHaveLength(2));
      expect(holds()[1]).toEqual({
        type: 'approval-held',
        requestId: 'ap-1',
        status: 'refused',
        message: 'Not allowed at your computer.',
      });
    });

    it('tells the phone when the computer allowed it', async () => {
      deps.answerApproval = vi.fn(async () => ({
        status: 'held' as const,
        message: 'waiting',
        settled: Promise.resolve({ allowed: true, message: 'Allowed at your computer.' }),
      }));
      const controller = await attachWithApproval();

      await controller.handleControl('code.approval.respond', approve());

      await vi.waitFor(() => expect(holds()).toHaveLength(2));
      expect(holds().map((event) => event['status'])).toEqual(['waiting', 'allowed']);
    });

    it('logs, and leaves no unhandled rejection, when how a held answer ended cannot be told', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      deps.answerApproval = vi.fn(async () => ({
        status: 'held' as const,
        message: 'waiting',
        settled: Promise.reject<{ allowed: boolean; message: string }>(new Error('window gone')),
      }));
      const controller = await attachWithApproval();

      try {
        await controller.handleControl('code.approval.respond', approve());

        await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
        expect(warn.mock.calls[0]?.[0]).toContain('held approval');
        expect(warn.mock.calls[0]?.[1]).toContain('window gone');
        expect(holds().map((event) => event['status'])).toEqual(['waiting']);
      } finally {
        warn.mockRestore();
      }
    });

    it('tells the phone why an answer was refused outright, instead of looking accepted', async () => {
      deps.answerApproval = vi.fn(async () => {
        throw new RemoteCommandRefused('Its screen is locked. Unlock it and answer again.');
      });
      const controller = await attachWithApproval();

      await expect(controller.handleControl('code.approval.respond', approve())).resolves.toBe(
        true,
      );

      expect(holds()).toEqual([
        {
          type: 'approval-held',
          requestId: 'ap-1',
          status: 'refused',
          message: 'Its screen is locked. Unlock it and answer again.',
        },
      ]);
    });

    it('sends nothing extra for an answer that was simply applied, and lets other failures surface', async () => {
      const controller = await attachWithApproval();
      await controller.handleControl('code.approval.respond', approve());
      expect(holds()).toEqual([]);

      deps.answerApproval = vi.fn(async () => {
        throw new Error('runtime gone');
      });
      const failing = await attachWithApproval();
      await expect(failing.handleControl('code.approval.respond', approve())).rejects.toThrow(
        'runtime gone',
      );
    });
  });

  it('shows a phone that joins mid-question the question the turn is waiting on', async () => {
    const base = activity();
    deps.readActivity = vi.fn(async () =>
      activity({
        transcript: {
          ...base.transcript,
          activeTurn: {
            turnId: 'turn-7',
            partialResponse: '',
            approvals: [],
            questions: [{ requestId: 'q-1', question: 'Which branch should I rebase onto?' }],
          },
        },
        activeTurn: { turnId: 'turn-7', partialResponse: '', pendingApprovals: [] },
      }),
    );
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    expect(sent.find((entry) => entry.action === 'code.session.snapshot')?.payload).toMatchObject({
      status: 'running',
      pendingQuestions: [
        { turnId: 'turn-7', requestId: 'q-1', question: 'Which branch should I rebase onto?' },
      ],
    });
  });

  it('sends a phone only the newest questions and approvals the snapshot contract admits', async () => {
    const base = activity();
    const questions = Array.from({ length: REMOTE_CODE_LIMITS.pendingQuestions + 5 }, (_, i) => ({
      requestId: `q-${i}`,
      question: `Question ${i}?`,
    }));
    deps.readActivity = vi.fn(async () =>
      activity({
        transcript: {
          ...base.transcript,
          activeTurn: { turnId: 'turn-7', partialResponse: '', approvals: [], questions },
        },
        activeTurn: {
          turnId: 'turn-7',
          partialResponse: '',
          pendingApprovals: Array.from(
            { length: REMOTE_CODE_LIMITS.pendingApprovals + 5 },
            (_, i) => ({ requestId: `ap-${i}`, summary: `Step ${i}`, detail: 'shell' }),
          ),
        },
      }),
    );
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    const snapshot = sent.find((entry) => entry.action === 'code.session.snapshot')?.payload;
    const parsed = parseRemoteCodeSnapshot(snapshot);
    expect(parsed?.pendingQuestions).toHaveLength(REMOTE_CODE_LIMITS.pendingQuestions);
    expect(parsed?.pendingQuestions.at(-1)?.requestId).toBe(`q-${questions.length - 1}`);
    expect(parsed?.pendingApprovals).toHaveLength(REMOTE_CODE_LIMITS.pendingApprovals);
  });

  it('relays questions as they are asked and answered, and drops them when the turn ends', async () => {
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );
    sent = [];

    await controller.handleSessionEvent('root-1', {
      type: 'user-input-requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'q-1',
      question: 'Keep the old flag?',
    });
    expect(lastEvent('user-input-requested')).toEqual({
      type: 'user-input-requested',
      turnId: 'turn-1',
      requestId: 'q-1',
      question: 'Keep the old flag?',
      answerable: true,
    });

    await controller.handleSessionEvent('root-1', {
      type: 'user-input-answered',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'q-1',
      cancelled: false,
    });
    expect(lastEvent('user-input-answered')).toEqual({
      type: 'user-input-answered',
      requestId: 'q-1',
    });

    await controller.handleSessionEvent('root-1', {
      type: 'user-input-requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'q-2',
      question: 'Push now?',
    });
    sent = [];
    await controller.handleSessionEvent('root-1', {
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      outcome: 'completed',
      response: 'Done.',
      failure: null,
    });
    expect(sent.find((entry) => entry.action === 'code.session.snapshot')?.payload).toMatchObject({
      pendingQuestions: [],
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

  it('withholds a CRLF credential header source', async () => {
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );
    await controller.handleSessionEvent('root-1', {
      type: 'turn-diff',
      threadId: 'thread-1',
      turnId: 'turn-1',
      unifiedDiff: [
        'diff --git a/config/server.key b/notes.txt',
        '@@ -1 +1 @@',
        '+private-key-material',
      ].join('\r\n'),
      paths: ['notes.txt'],
    });
    expect(JSON.stringify(sent)).not.toContain('private-key-material');
    expect(JSON.stringify(sent)).toContain(WITHHELD_DIFF);
  });

  it.each(['--- a/', 'rename from ', 'copy from '])(
    'withholds Unicode credential metadata %s',
    async (prefix) => {
      for (const separator of ['\u2028', '\u2029']) {
        const source = `config/server${separator}.key`;
        expect(isCredentialPath(source)).toBe(true);
        const controller = createCodeRemoteController(deps);
        await controller.handleControl(
          'code.session.attach',
          request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
        );
        await controller.handleSessionEvent('root-1', {
          type: 'turn-diff',
          threadId: 'thread-1',
          turnId: 'turn-1',
          unifiedDiff: [
            'diff --git a/old.txt b/notes.txt',
            `${prefix}${source}`,
            '+++ b/notes.txt',
            '@@ -1 +1 @@',
            '+private-key-material',
          ].join('\n'),
          paths: ['notes.txt'],
        });
        expect(JSON.stringify(sent)).not.toContain('private-key-material');
        expect(JSON.stringify(sent)).toContain(WITHHELD_DIFF);
      }
    },
  );

  it.each(['--- a/', 'rename from ', 'copy from '])(
    'withholds CRLF credential metadata %s',
    async (prefix) => {
      const controller = createCodeRemoteController(deps);
      await controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      );
      await controller.handleSessionEvent('root-1', {
        type: 'turn-diff',
        threadId: 'thread-1',
        turnId: 'turn-1',
        unifiedDiff: [
          'diff --git a/old.txt b/notes.txt',
          `${prefix}config/server.key`,
          '+++ b/notes.txt',
          '@@ -1 +1 @@',
          '+private-key-material',
        ].join('\r\n'),
        paths: ['notes.txt'],
      });
      expect(JSON.stringify(sent)).not.toContain('private-key-material');
      expect(JSON.stringify(sent)).toContain(WITHHELD_DIFF);
    },
  );

  it.each(['\u2028', '\u2029'])(
    'withholds a credential header source when the destination contains %j',
    async (separator) => {
      const destination = `notes${separator}tail.txt`;
      const controller = createCodeRemoteController(deps);
      await controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      );
      await controller.handleSessionEvent('root-1', {
        type: 'turn-diff',
        threadId: 'thread-1',
        turnId: 'turn-1',
        unifiedDiff: `diff --git a/config/server.key b/${destination}\n@@ -1 +1 @@\n+private-key-material`,
        paths: [destination],
      });
      expect(JSON.stringify(sent)).not.toContain('private-key-material');
      expect(JSON.stringify(sent)).toContain(WITHHELD_DIFF);
    },
  );

  it.each(['notes.txt', 'notes b/', 'folder with spaces/notes.txt'])(
    'withholds a header-only credential source renamed to %s',
    async (destination) => {
      const controller = createCodeRemoteController(deps);
      await controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      );
      await controller.handleSessionEvent('root-1', {
        type: 'turn-diff',
        threadId: 'thread-1',
        turnId: 'turn-1',
        unifiedDiff: `diff --git a/config/server.key b/${destination}\n+++ b/${destination}\n@@ -1 +1 @@\n+private-key-material`,
        paths: [destination],
      });
      expect(JSON.stringify(sent)).not.toContain('private-key-material');
      expect(JSON.stringify(sent)).toContain(WITHHELD_DIFF);
    },
  );

  it.each(['\r', '\u2028', '\u2029'])(
    'handles ambiguous malformed diff headers with %j without blocking or hiding later credential sources',
    async (terminator) => {
      const controller = createCodeRemoteController(deps);
      await controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      );
      const malformed = 'diff --git a/' + 'x b/'.repeat(12_000) + terminator + 'tail';
      const patch = [
        'diff --git a/config/server.key b/notes.txt',
        malformed,
        '@@ -1 +1 @@',
        '+private-key-material',
      ].join('\n');
      const start = performance.now();
      await controller.handleSessionEvent('root-1', {
        type: 'turn-diff',
        threadId: 'thread-1',
        turnId: 'turn-1',
        unifiedDiff: patch,
        paths: ['notes.txt'],
      });
      expect(performance.now() - start).toBeLessThan(1_000);
      expect(JSON.stringify(sent)).not.toContain('private-key-material');
      expect(JSON.stringify(sent)).toContain(WITHHELD_DIFF);
    },
  );

  it('names a changed credential file to the phone and withholds its contents, whichever way the diff arrived', async () => {
    const secret = 'STRIPE_SECRET_KEY=sk_live_abc123';
    const envPatch = [
      'diff --git a/.env.production b/.env.production',
      '--- a/.env.production',
      '+++ b/.env.production',
      '@@ -1 +1 @@',
      `+${secret}`,
    ].join('\n');
    const renamedPatch = [
      'diff --git a/config/server.key b/notes.txt',
      'rename from config/server.key',
      'rename to notes.txt',
      '@@ -1 +1 @@',
      `+${secret}`,
    ].join('\n');
    deps.readActivity = vi.fn(async () =>
      activity({
        fileChanges: [
          {
            path: '.env.production',
            kind: 'modified',
            tool: 'edit_file',
            toolCallId: 'call-1',
            changedAt: SENT_AT,
          },
          {
            path: 'src/retry.ts',
            kind: 'modified',
            tool: 'edit_file',
            toolCallId: 'call-2',
            changedAt: SENT_AT,
          },
        ],
      }),
    );
    const controller = createCodeRemoteController(deps);

    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );
    expect(deps.readDiff).toHaveBeenCalledWith('root-1', ['src/retry.ts']);

    await controller.handleSessionEvent('root-1', {
      type: 'turn-diff',
      threadId: 'thread-1',
      turnId: 'turn-1',
      unifiedDiff: `${GIT_DIFF}\n${envPatch}\n${renamedPatch}`,
      paths: ['src/retry.ts', '.env.production', 'notes.txt'],
    });
    await controller.handleSessionEvent('root-1', {
      type: 'tool-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      toolCallId: 'call-edit',
      name: 'edit_file',
      output: `Edited.\n${envPatch}`,
      isError: false,
    });

    const diffs = sent
      .map(
        (entry) =>
          (entry.payload as { event?: { type: string; diff?: { path: string; patch: string } } })
            .event,
      )
      .filter((event) => event?.type === 'diff')
      .map((event) => event?.diff);
    expect(JSON.stringify(sent)).not.toContain(secret);
    expect(diffs.filter((diff) => diff?.path === '.env.production').length).toBeGreaterThan(0);
    for (const diff of diffs) {
      if (diff?.path === 'src/retry.ts') expect(diff.patch).toBe(GIT_DIFF);
      else expect(diff?.patch).toBe(WITHHELD_DIFF);
    }
    expect(diffs.map((diff) => diff?.path)).toEqual(
      expect.arrayContaining(['.env.production', 'notes.txt', 'src/retry.ts']),
    );
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

  // Session events are not relayed while no phone is connected, so the end of
  // a turn can be missed entirely. What the runtime says on the next attach
  // has to win over what was remembered.
  it('shows a session idle again, and takes a new message, when its turn ended while the phone was away', async () => {
    const running = {
      turnId: 'turn-7',
      partialResponse: 'Editing retry.ts',
      pendingApprovals: [{ requestId: 'ap-1', summary: 'Run pnpm test', detail: 'shell' }],
    };
    deps.readActivity = vi.fn(async () =>
      activity({
        activeTurn: running,
        transcript: {
          ...activity().transcript,
          activeTurn: {
            turnId: 'turn-7',
            partialResponse: 'Editing retry.ts',
            approvals: [],
            questions: [{ requestId: 'q-1', question: 'Which branch?' }],
          },
        },
      }),
    );
    const controller = createCodeRemoteController(deps);
    const attach = () =>
      controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      );
    await attach();
    await controller.handleControl(
      'code.session.detach',
      request('detach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    deps.readActivity = vi.fn(async () => activity());
    sent = [];
    await attach();

    expect(sent.find((entry) => entry.action === 'code.session.snapshot')?.payload).toMatchObject({
      status: 'idle',
      activeTurnId: null,
      partialResponse: '',
      pendingApprovals: [],
      pendingQuestions: [],
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
    expect(deps.answerApproval).not.toHaveBeenCalled();

    await controller.handleControl(
      'code.session.steer',
      request('steer', { rootId: 'root-1', threadId: 'thread-1', text: 'now add a test' }),
    );
    expect(deps.startTurn).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      text: 'now add a test',
    });
    expect(lastEvent('guidance-queued')).toBeUndefined();
  });

  it('delivers guidance that was waiting on a turn which ended while the phone was away', async () => {
    const controller = createCodeRemoteController(deps);
    const attach = () =>
      controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      );
    await attach();
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

    sent = [];
    await attach();

    expect(sent.find((entry) => entry.action === 'code.session.snapshot')?.payload).toMatchObject({
      activeTurnId: null,
      queuedGuidance: ['skip the docs'],
    });
    expect(deps.startTurn).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      text: 'skip the docs',
    });
    expect(lastEvent('guidance-delivered')).toMatchObject({
      turnId: 'turn-guided',
      queuedGuidance: [],
      text: 'skip the docs',
    });
  });

  it('keeps what a phone queued while it is away, and drops it for good once the pairing is forgotten', async () => {
    const running = { turnId: 'turn-1', partialResponse: '', pendingApprovals: [] };
    const steer = (controller: ReturnType<typeof createCodeRemoteController>) =>
      controller.handleControl(
        'code.session.steer',
        request('steer', { rootId: 'root-1', threadId: 'thread-1', text: 'delete the branch' }),
      );
    const attach = (controller: ReturnType<typeof createCodeRemoteController>) =>
      controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      );

    deps.readActivity = vi.fn(async () => activity({ activeTurn: running }));
    const kept = createCodeRemoteController(deps);
    await attach(kept);
    await steer(kept);
    kept.detach();
    expect(kept.attachedThreadCount()).toBe(0);
    deps.readActivity = vi.fn(async () => activity());
    await attach(kept);
    expect(deps.startTurn).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      text: 'delete the branch',
    });

    vi.mocked(deps.startTurn).mockClear();
    deps.readActivity = vi.fn(async () => activity({ activeTurn: running }));
    const forgotten = createCodeRemoteController(deps);
    await attach(forgotten);
    await steer(forgotten);
    forgotten.forget();
    deps.readActivity = vi.fn(async () => activity());
    sent = [];
    await attach(forgotten);

    expect(deps.startTurn).not.toHaveBeenCalled();
    expect(sent.find((entry) => entry.action === 'code.session.snapshot')?.payload).toMatchObject({
      queuedGuidance: [],
    });
    expect(lastEvent('guidance-delivered')).toBeUndefined();
  });

  it('starts nothing for a phone whose pairing was stopped while its snapshot was being read', async () => {
    const running = { turnId: 'turn-1', partialResponse: '', pendingApprovals: [] };
    deps.readActivity = vi.fn(async () => activity({ activeTurn: running }));
    const controller = createCodeRemoteController(deps);
    const attach = () =>
      controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      );
    await attach();
    await controller.handleControl(
      'code.session.steer',
      request('steer', { rootId: 'root-1', threadId: 'thread-1', text: 'delete the branch' }),
    );

    let release: () => void = () => undefined;
    deps.readActivity = vi.fn(
      () =>
        new Promise<DeveloperSessionActivity>((resolve) => {
          release = () => resolve(activity());
        }),
    );
    sent = [];
    const reopened = attach();
    controller.forget();
    release();
    await reopened;

    expect(deps.startTurn).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('starts no session for a start request whose pairing was stopped while it listed folders', async () => {
    const controller = createCodeRemoteController(deps);
    let release: () => void = () => undefined;
    const listed = deps.listSessions;
    deps.listSessions = vi.fn(
      () =>
        new Promise<DeveloperSessionList>((resolve) => {
          release = () => resolve(listed());
        }),
    );
    deps.startSession = vi.fn(async () => ({ threadId: 'thread-new' }));
    const start = controller.handleControl(
      'code.session.start',
      request('start', { rootId: 'root-1', text: 'build it' }),
    );
    controller.forget();
    release();
    await start;

    expect(deps.startSession).not.toHaveBeenCalled();
    expect(deps.startTurn).not.toHaveBeenCalled();
  });

  // A diff read from a tool's own output is what that tool wrote then. Once
  // no turn runs, the file on disk is the truth, and git reads it.
  it('shows the diff git reads now, not one a finished turn left behind', async () => {
    const stale = [
      'diff --git a/src/retry.ts b/src/retry.ts',
      '--- a/src/retry.ts',
      '+++ b/src/retry.ts',
      '@@ -1 +1 @@',
      '-const attempts = 3;',
      '+const attempts = 4;',
    ].join('\n');
    const controller = createCodeRemoteController(deps);
    const attach = () =>
      controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      );
    const diffs = () =>
      sent
        .filter((entry) => entry.action === 'code.session.event')
        .map((entry) => entry.payload['event'] as { type: string; diff?: { patch: string } })
        .filter((event) => event.type === 'diff')
        .map((event) => event.diff?.patch);
    await attach();
    await controller.handleSessionEvent('root-1', {
      type: 'turn-started',
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
    await controller.handleSessionEvent('root-1', {
      type: 'turn-diff',
      threadId: 'thread-1',
      turnId: 'turn-1',
      unifiedDiff: stale,
      paths: ['src/retry.ts'],
    });
    expect(diffs()).toEqual([GIT_DIFF, stale]);

    sent = [];
    await attach();

    expect(diffs()).toEqual([GIT_DIFF]);
    expect(deps.readDiff).toHaveBeenLastCalledWith('root-1', ['src/retry.ts']);
  });

  it('starts each turn with no diff left from the one before', async () => {
    const earlier = [
      'diff --git a/src/old.ts b/src/old.ts',
      '--- a/src/old.ts',
      '+++ b/src/old.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n');
    const running = { turnId: 'turn-2', partialResponse: '', pendingApprovals: [] };
    const controller = createCodeRemoteController(deps);
    await controller.handleSessionEvent('root-1', {
      type: 'turn-diff',
      threadId: 'thread-1',
      turnId: 'turn-1',
      unifiedDiff: earlier,
      paths: ['src/old.ts'],
    });
    await controller.handleSessionEvent('root-1', {
      type: 'turn-started',
      threadId: 'thread-1',
      turnId: 'turn-2',
    });
    deps.readActivity = vi.fn(async () => activity({ activeTurn: running }));

    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    const patches = sent
      .filter((entry) => entry.action === 'code.session.event')
      .map((entry) => entry.payload['event'] as { type: string; diff?: { patch: string } })
      .filter((event) => event.type === 'diff')
      .map((event) => event.diff?.patch);
    expect(patches).toEqual([GIT_DIFF]);
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

describe('a snapshot replaces the turn and approvals the controller remembered', () => {
  const RUNNING = {
    turnId: 'turn-7',
    partialResponse: 'Editing retry.ts',
    pendingApprovals: [{ requestId: 'ap-1', summary: 'Run pnpm test', detail: 'shell' }],
  };

  const APPROVAL_ASKED: DeveloperSessionEvent = {
    type: 'approval-requested',
    threadId: 'thread-1',
    turnId: 'turn-7',
    requestId: 'ap-1',
    kind: 'command',
    summary: 'Run pnpm test',
    detail: 'shell',
    command: 'pnpm test',
    riskLevel: null,
    reversible: null,
  };

  function attach(controller: ReturnType<typeof createCodeRemoteController>) {
    return controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );
  }

  function respond(controller: ReturnType<typeof createCodeRemoteController>, approvalId: string) {
    return controller.handleControl(
      'code.approval.respond',
      request('approve', {
        rootId: 'root-1',
        threadId: 'thread-1',
        turnId: 'turn-7',
        approvalRequestId: approvalId,
        approved: true,
      }),
    );
  }

  function lastSnapshot() {
    return sent.filter((entry) => entry.action === 'code.session.snapshot').at(-1)?.payload;
  }

  async function listedStatus(controller: ReturnType<typeof createCodeRemoteController>) {
    await controller.handleControl('code.sessions.list', request('list'));
    const list = sent.filter((entry) => entry.action === 'code.sessions').at(-1)?.payload;
    return (list?.['sessions'] as Array<{ threadId: string; status: string }>).find(
      (entry) => entry.threadId === 'thread-1',
    )?.status;
  }

  function heldRead(stale: DeveloperSessionActivity) {
    let release: () => void = () => undefined;
    deps.readActivity = vi
      .fn<CodeRemoteDependencies['readActivity']>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(stale);
          }),
      )
      .mockImplementation(async () => activity());
    return () => release();
  }

  it('drops an approval the same turn no longer waits on', async () => {
    deps.readActivity = vi.fn(async () => activity({ activeTurn: RUNNING }));
    const controller = createCodeRemoteController(deps);
    await attach(controller);
    deps.readActivity = vi.fn(async () =>
      activity({ activeTurn: { ...RUNNING, pendingApprovals: [] } }),
    );
    await attach(controller);

    expect(lastSnapshot()).toMatchObject({
      status: 'running',
      activeTurnId: 'turn-7',
      pendingApprovals: [],
    });
    expect(await listedStatus(controller)).toBe('running');
    await respond(controller, 'ap-1');
    expect(deps.answerApproval).not.toHaveBeenCalled();
  });

  it('carries no approval from an earlier turn into the one now running', async () => {
    deps.readActivity = vi.fn(async () => activity({ activeTurn: RUNNING }));
    const controller = createCodeRemoteController(deps);
    await attach(controller);
    deps.readActivity = vi.fn(async () =>
      activity({
        activeTurn: {
          turnId: 'turn-8',
          partialResponse: 'Adding a test',
          pendingApprovals: [{ requestId: 'ap-2', summary: 'Write file', detail: 'fs' }],
        },
      }),
    );
    await attach(controller);

    expect(lastSnapshot()).toMatchObject({
      status: 'awaiting_approval',
      activeTurnId: 'turn-8',
      partialResponse: 'Adding a test',
      pendingApprovals: [{ turnId: 'turn-8', requestId: 'ap-2' }],
    });
    await respond(controller, 'ap-1');
    expect(deps.answerApproval).not.toHaveBeenCalled();
  });

  it('shows no approval when the computer reports no running turn after a missed finish', async () => {
    deps.readActivity = vi.fn(async () => activity({ activeTurn: RUNNING }));
    const controller = createCodeRemoteController(deps);
    await attach(controller);
    deps.readActivity = vi.fn(async () => activity());
    await attach(controller);

    expect(lastSnapshot()).toMatchObject({
      status: 'idle',
      activeTurnId: null,
      pendingApprovals: [],
    });
    expect(await listedStatus(controller)).not.toBe('awaiting_approval');
  });

  it('does not bring back an approval answered while the snapshot was being read', async () => {
    const release = heldRead(activity({ activeTurn: RUNNING }));
    const controller = createCodeRemoteController(deps);
    const attaching = attach(controller);
    await controller.handleSessionEvent('root-1', APPROVAL_ASKED);
    await controller.handleSessionEvent('root-1', {
      type: 'approval-answered',
      threadId: 'thread-1',
      turnId: 'turn-7',
      requestId: 'ap-1',
      decision: 'approve_once',
      approved: true,
    });
    release();
    await attaching;

    expect(lastSnapshot()).toMatchObject({
      status: 'running',
      activeTurnId: 'turn-7',
      pendingApprovals: [],
    });
    await respond(controller, 'ap-1');
    expect(deps.answerApproval).not.toHaveBeenCalled();
  });

  it('keeps an approval asked for while an older snapshot was being read', async () => {
    const release = heldRead(activity({ activeTurn: { ...RUNNING, pendingApprovals: [] } }));
    const controller = createCodeRemoteController(deps);
    const attaching = attach(controller);
    await controller.handleSessionEvent('root-1', APPROVAL_ASKED);
    release();
    await attaching;

    expect(lastSnapshot()).toMatchObject({
      status: 'awaiting_approval',
      pendingApprovals: [{ turnId: 'turn-7', requestId: 'ap-1', summary: 'Run pnpm test' }],
    });
    await respond(controller, 'ap-1');
    expect(deps.answerApproval).toHaveBeenCalledTimes(1);
  });

  it('keeps a turn that finished while the snapshot was being read finished', async () => {
    const release = heldRead(activity({ activeTurn: RUNNING }));
    const controller = createCodeRemoteController(deps);
    const attaching = attach(controller);
    await controller.handleSessionEvent('root-1', {
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-7',
      outcome: 'completed',
      response: 'Done.',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
    });
    release();
    await attaching;

    expect(lastSnapshot()).toMatchObject({
      status: 'idle',
      activeTurnId: null,
      partialResponse: '',
      pendingApprovals: [],
    });
    expect(await listedStatus(controller)).not.toBe('awaiting_approval');
    await respond(controller, 'ap-1');
    expect(deps.answerApproval).not.toHaveBeenCalled();
  });

  it('shows the turn that started while the snapshot was being read, with only its own output', async () => {
    const release = heldRead(activity({ activeTurn: RUNNING }));
    const controller = createCodeRemoteController(deps);
    const attaching = attach(controller);
    await controller.handleSessionEvent('root-1', {
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-7',
      outcome: 'completed',
      response: 'Done.',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
    });
    await controller.handleSessionEvent('root-1', {
      type: 'turn-started',
      threadId: 'thread-1',
      turnId: 'turn-8',
    });
    await controller.handleSessionEvent('root-1', {
      type: 'output-delta',
      threadId: 'thread-1',
      turnId: 'turn-8',
      delta: 'Adding a test',
    });
    release();
    await attaching;

    expect(lastSnapshot()).toMatchObject({
      status: 'running',
      activeTurnId: 'turn-8',
      partialResponse: 'Adding a test',
      pendingApprovals: [],
    });
  });

  it('does not repeat output the snapshot may already hold when its turn began before the read', async () => {
    const release = heldRead(activity({ activeTurn: { ...RUNNING, pendingApprovals: [] } }));
    const controller = createCodeRemoteController(deps);
    const attaching = attach(controller);
    await controller.handleSessionEvent('root-1', {
      type: 'output-delta',
      threadId: 'thread-1',
      turnId: 'turn-7',
      delta: ' and its test',
    });
    release();
    await attaching;

    expect(lastSnapshot()).toMatchObject({
      activeTurnId: 'turn-7',
      partialResponse: 'Editing retry.ts',
    });
  });
});

describe('what the phone needs to show a session as a conversation', () => {
  const CHOICE_ASKED: DeveloperSessionEvent = {
    type: 'approval-requested',
    threadId: 'thread-1',
    turnId: 'turn-7',
    requestId: 'ask-1',
    kind: 'question',
    summary: 'Choose a base branch',
    detail: '',
    command: null,
    riskLevel: null,
    reversible: null,
    question: { question: 'Which branch should I rebase onto?', options: ['main', 'release'] },
  };

  async function attached() {
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );
    sent = [];
    return controller;
  }

  function answer(
    controller: ReturnType<typeof createCodeRemoteController>,
    questionRequestId: string,
    value: string | null,
  ) {
    return controller.handleControl(
      'code.question.respond',
      request('answer', {
        rootId: 'root-1',
        threadId: 'thread-1',
        turnId: 'turn-7',
        questionRequestId,
        answer: value,
      }),
    );
  }

  function snapshot() {
    return parseRemoteCodeSnapshot(
      sent.filter((entry) => entry.action === 'code.session.snapshot').at(-1)?.payload,
    );
  }

  it('says which turn ran each tool, live and in the snapshot', async () => {
    const controller = await attached();
    await controller.handleSessionEvent('root-1', {
      type: 'tool-started',
      threadId: 'thread-1',
      turnId: 'turn-7',
      toolCallId: 'call-9',
      name: 'shell',
      summary: 'pnpm test',
    });
    await controller.handleSessionEvent('root-1', {
      type: 'tool-finished',
      threadId: 'thread-1',
      turnId: 'turn-7',
      toolCallId: 'call-9',
      name: 'shell',
      output: 'ok',
      isError: false,
    });
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    expect(snapshot()?.tools).toEqual([
      {
        toolCallId: 'call-9',
        name: 'shell',
        summary: 'pnpm test',
        state: 'done',
        output: 'ok',
        turnId: 'turn-7',
      },
    ]);
  });

  it('says which turn each message belongs to where the computer recorded one', async () => {
    deps.readActivity = vi.fn(async () =>
      activity({
        transcript: {
          session: session(),
          messages: [
            { role: 'user', text: 'make retries back off', turnId: 'turn-6' },
            { role: 'assistant', text: 'Done.', turnId: 'turn-6' },
            { role: 'user', text: 'an older message with no turn' },
          ],
          truncated: false,
          activeTurn: null,
        },
      }),
    );
    await attached().then((controller) =>
      controller.handleControl(
        'code.session.attach',
        request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
      ),
    );

    expect(snapshot()?.messages).toEqual([
      { role: 'user', text: 'make retries back off', turnId: 'turn-6' },
      { role: 'assistant', text: 'Done.', turnId: 'turn-6' },
      { role: 'user', text: 'an older message with no turn' },
    ]);
  });

  it('relays thinking as it arrives and keeps it for a phone that joins later', async () => {
    const controller = await attached();
    await controller.handleSessionEvent('root-1', {
      type: 'reasoning-delta',
      threadId: 'thread-1',
      turnId: 'turn-7',
      delta: 'The backoff is linear. ',
    });
    await controller.handleSessionEvent('root-1', {
      type: 'reasoning-delta',
      threadId: 'thread-1',
      turnId: 'turn-7',
      delta: 'Make it exponential.',
    });
    expect(lastEvent('thinking-delta')).toEqual({
      type: 'thinking-delta',
      turnId: 'turn-7',
      delta: 'Make it exponential.',
    });

    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );
    expect(snapshot()?.thinking).toEqual([
      { turnId: 'turn-7', text: 'The backoff is linear. Make it exponential.' },
    ]);
  });

  it('keeps thinking for the newest turns only', async () => {
    const controller = await attached();
    for (let turn = 0; turn < REMOTE_CODE_LIMITS.thinkingTurns + 2; turn += 1) {
      await controller.handleSessionEvent('root-1', {
        type: 'reasoning-delta',
        threadId: 'thread-1',
        turnId: `turn-${turn}`,
        delta: `thought ${turn}`,
      });
    }
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    const kept = snapshot()?.thinking ?? [];
    expect(kept).toHaveLength(REMOTE_CODE_LIMITS.thinkingTurns);
    expect(kept.at(-1)?.turnId).toBe(`turn-${REMOTE_CODE_LIMITS.thinkingTurns + 1}`);
  });

  it('never relays a secret that appears in thinking', async () => {
    const controller = await attached();
    const secret = `sk-ant-${'a'.repeat(40)}`;
    await controller.handleSessionEvent('root-1', {
      type: 'reasoning-delta',
      threadId: 'thread-1',
      turnId: 'turn-7',
      delta: `The key is ${secret}`,
    });

    expect(lastEvent('thinking-delta')).toBeDefined();
    expect(JSON.stringify(sent)).not.toContain(secret);
  });

  it('shows a choice the agent asks as a question with its options, not as an approval', async () => {
    const controller = await attached();
    await controller.handleSessionEvent('root-1', CHOICE_ASKED);

    expect(lastEvent('approval-requested')).toBeUndefined();
    expect(lastEvent('user-input-requested')).toEqual({
      type: 'user-input-requested',
      turnId: 'turn-7',
      requestId: 'ask-1',
      question: 'Which branch should I rebase onto?',
      options: ['main', 'release'],
      answerable: true,
    });
  });

  it('answers a choice through the approval it was asked through, carrying the option', async () => {
    const controller = await attached();
    await controller.handleSessionEvent('root-1', CHOICE_ASKED);
    await answer(controller, 'ask-1', 'release');

    expect(deps.answerApproval).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-7',
      requestId: 'ask-1',
      decision: 'approve_once',
      note: 'release',
    });
    expect(deps.answerQuestion).not.toHaveBeenCalled();
  });

  it('denies a choice the phone dismisses', async () => {
    const controller = await attached();
    await controller.handleSessionEvent('root-1', CHOICE_ASKED);
    await answer(controller, 'ask-1', null);

    expect(deps.answerApproval).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-7',
      requestId: 'ask-1',
      decision: 'deny',
    });
  });

  it('clears a choice once it is answered and tells the phone', async () => {
    const controller = await attached();
    await controller.handleSessionEvent('root-1', CHOICE_ASKED);
    await controller.handleSessionEvent('root-1', {
      type: 'approval-answered',
      threadId: 'thread-1',
      turnId: 'turn-7',
      requestId: 'ask-1',
      decision: 'approve_once',
      approved: true,
    });

    expect(lastEvent('user-input-answered')).toEqual({
      type: 'user-input-answered',
      requestId: 'ask-1',
    });
    expect(lastEvent('approval-answered')).toBeUndefined();
  });

  it('shows a phone that joins mid-choice the choice, and no approval for it', async () => {
    deps.readActivity = vi.fn(async () =>
      activity({
        transcript: {
          session: session({ status: 'running' }),
          messages: [],
          truncated: false,
          activeTurn: {
            turnId: 'turn-7',
            partialResponse: '',
            approvals: [
              {
                requestId: 'ask-1',
                kind: 'question',
                summary: 'Choose a base branch',
                detail: '',
                command: null,
                riskLevel: null,
                reversible: null,
                question: { question: 'Which branch?', options: ['main', 'release'] },
              },
            ],
            questions: [],
          },
        },
        activeTurn: {
          turnId: 'turn-7',
          partialResponse: '',
          pendingApprovals: [{ requestId: 'ask-1', summary: 'Choose a base branch', detail: '' }],
        },
      }),
    );
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    expect(snapshot()).toMatchObject({
      status: 'awaiting_approval',
      pendingApprovals: [],
      pendingQuestions: [
        {
          turnId: 'turn-7',
          requestId: 'ask-1',
          question: 'Which branch?',
          options: ['main', 'release'],
          answerable: true,
        },
      ],
    });
  });

  it('hands a typed answer to the question the agent is waiting on', async () => {
    const controller = await attached();
    await controller.handleSessionEvent('root-1', {
      type: 'user-input-requested',
      threadId: 'thread-1',
      turnId: 'turn-7',
      requestId: 'q-1',
      question: 'Which port?',
    });
    await answer(controller, 'q-1', '8080');

    expect(deps.answerQuestion).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-7',
      requestId: 'q-1',
      answer: '8080',
    });
    expect(deps.answerApproval).not.toHaveBeenCalled();
  });

  it('ignores an answer to a question that is not waiting', async () => {
    const controller = await attached();
    await answer(controller, 'q-gone', '8080');

    expect(deps.answerQuestion).not.toHaveBeenCalled();
    expect(deps.answerApproval).not.toHaveBeenCalled();
  });

  it('tells the phone to answer at the computer when the host cannot take typed answers', async () => {
    delete deps.answerQuestion;
    const controller = await attached();
    await controller.handleSessionEvent('root-1', {
      type: 'user-input-requested',
      threadId: 'thread-1',
      turnId: 'turn-7',
      requestId: 'q-1',
      question: 'Which port?',
    });

    expect(lastEvent('user-input-requested')).toEqual({
      type: 'user-input-requested',
      turnId: 'turn-7',
      requestId: 'q-1',
      question: 'Which port?',
    });
  });

  it('counts the sub-tasks still queued or running', async () => {
    deps.readActivity = vi.fn(async () =>
      activity({
        transcript: {
          session: session(),
          messages: [],
          truncated: false,
          activeTurn: null,
          childTasks: [
            { id: 'c-1', parentSessionId: 'thread-1', title: 'Audit', state: 'running' },
            { id: 'c-2', parentSessionId: 'thread-1', title: 'Tests', state: 'queued' },
            { id: 'c-3', parentSessionId: 'thread-1', title: 'Docs', state: 'completed' },
          ],
        },
      }),
    );
    const controller = createCodeRemoteController(deps);
    await controller.handleControl(
      'code.session.attach',
      request('attach', { rootId: 'root-1', threadId: 'thread-1' }),
    );

    expect(snapshot()?.runningTasks).toBe(2);
  });

  it('knows whether a phone has a session open', async () => {
    const controller = await attached();
    expect(controller.isAttached('root-1', 'thread-1')).toBe(true);
    expect(controller.isAttached('root-1', 'thread-2')).toBe(false);
    controller.detach();
    expect(controller.isAttached('root-1', 'thread-1')).toBe(false);
  });
});
