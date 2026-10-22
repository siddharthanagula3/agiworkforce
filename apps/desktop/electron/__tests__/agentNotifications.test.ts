import { describe, expect, it, vi } from 'vitest';
import type {
  DeveloperApprovalRequest,
  DeveloperSessionEvent,
  HostAgentNotificationPreferences,
} from '@agiworkforce/local-runtime-contract';
import {
  APPROVE_ACTION_INDEX,
  answerableFromNotification,
  approvalBody,
  DENY_ACTION_INDEX,
  createAgentNotifier,
  shouldNotify,
  type AgentNotifierDeps,
  type NotificationOptionsLike,
} from '../agentNotifications';

interface FakeNotification {
  options: NotificationOptionsLike;
  click: () => void;
  action: (index: number) => void;
  closed: boolean;
}

function harness(overrides: Partial<AgentNotifierDeps> = {}) {
  const shown: FakeNotification[] = [];
  let preferences: HostAgentNotificationPreferences = {
    when: 'unfocused',
    muted: [],
    sound: true,
  };
  let focused = false;
  const deps: AgentNotifierDeps = {
    preferences: () => preferences,
    appFocused: () => focused,
    supported: () => true,
    supportsActions: true,
    create: (options) => {
      const fake: FakeNotification = {
        options,
        click: () => undefined,
        action: () => undefined,
        closed: false,
      };
      return {
        onClick: (listener) => {
          fake.click = listener;
        },
        onAction: (listener) => {
          fake.action = listener;
        },
        onClose: () => undefined,
        show: () => shown.push(fake),
        close: () => {
          fake.closed = true;
        },
      };
    },
    answerApproval: vi.fn(async () => true),
    reviewApproval: vi.fn(async (pending: { requestId: string }) => ({
      request: { ...approvalRequest, requestId: pending.requestId },
      reserved: [],
    })),
    openSession: vi.fn(),
    sessionLabel: () => 'agiworkforce',
    drawAttention: vi.fn(),
    onActivityChanged: vi.fn(),
    onAnswerFailed: vi.fn(),
    ...overrides,
  };
  const notifier = createAgentNotifier(deps);
  return {
    notifier,
    deps,
    shown,
    setPreferences: (next: HostAgentNotificationPreferences) => {
      preferences = next;
    },
    setFocused: (next: boolean) => {
      focused = next;
    },
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const approvalRequest: DeveloperApprovalRequest = {
  requestId: 'req-1',
  kind: 'Exec',
  summary: 'Run pnpm test',
  detail: '',
  command: 'pnpm test',
  riskLevel: 'low',
  reversible: true,
};

const approval: DeveloperSessionEvent = {
  type: 'approval-requested',
  threadId: 'thread-1',
  turnId: 'turn-1',
  requestId: 'req-1',
  kind: 'command',
  summary: 'Run pnpm test',
  detail: '',
  command: 'pnpm test',
  riskLevel: 'low',
  reversible: true,
};

const finished = (
  outcome: 'completed' | 'failed' | 'interrupted',
  turnId = 'turn-1',
): DeveloperSessionEvent => ({
  type: 'turn-finished',
  threadId: 'thread-1',
  turnId,
  outcome,
  response: 'All tests pass.',
  failure:
    outcome === 'failed'
      ? {
          code: 'provider_rate_limited',
          message: 'The model provider refused the request.',
          provider: null,
          action: 'retry',
          retryable: true,
        }
      : null,
});

describe('shouldNotify', () => {
  const base: HostAgentNotificationPreferences = { when: 'unfocused', muted: [], sound: true };

  it('notifies only while the app is in the background by default', () => {
    expect(shouldNotify(base, 'approval', false)).toBe(true);
    expect(shouldNotify(base, 'approval', true)).toBe(false);
  });

  it('always and never ignore focus', () => {
    expect(shouldNotify({ ...base, when: 'always' }, 'turn-complete', true)).toBe(true);
    expect(shouldNotify({ ...base, when: 'never' }, 'approval', false)).toBe(false);
  });

  it('a muted kind stays quiet while other kinds still notify', () => {
    const muted = { ...base, when: 'always' as const, muted: ['turn-complete' as const] };
    expect(shouldNotify(muted, 'turn-complete', false)).toBe(false);
    expect(shouldNotify(muted, 'approval', false)).toBe(true);
  });
});

describe('agent notifications', () => {
  it('routes Approve and Deny to the same answer the panel sends', async () => {
    const { notifier, deps, shown } = harness();
    notifier.handle('root-1', approval);
    await settle();

    expect(shown).toHaveLength(1);
    expect(shown[0]?.options.actions?.map((action) => action.text)).toEqual(['Approve', 'Deny']);
    shown[0]?.action(APPROVE_ACTION_INDEX);
    await settle();
    expect(deps.answerApproval).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'req-1',
      decision: 'approve_once',
    });

    notifier.handle('root-1', { ...approval, requestId: 'req-2' });
    await settle();
    shown[1]?.action(DENY_ACTION_INDEX);
    expect(deps.answerApproval).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'req-2', decision: 'deny' }),
    );
  });

  // A banner stays up, and what its button was drawn from can stop being
  // true: a link the write goes through is swapped, a remote is renamed, the
  // request is answered elsewhere. The press is judged on what the CLI holds
  // at the press.
  it('judges Approve again when it is pressed, and opens the session for what has come to need the dialog', async () => {
    const routine = { request: { ...approvalRequest }, reserved: [] };
    const reviewApproval = vi
      .fn()
      .mockResolvedValueOnce(routine)
      .mockResolvedValueOnce({ ...routine, reserved: ['protected-path'] })
      .mockResolvedValueOnce(routine)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(routine)
      .mockResolvedValueOnce({ request: { ...approvalRequest, riskLevel: 'high' }, reserved: [] });
    const { notifier, deps, shown } = harness({ reviewApproval });

    for (const [index, requestId] of ['req-link', 'req-gone', 'req-risk'].entries()) {
      notifier.handle('root-1', { ...approval, requestId });
      await settle();
      expect(shown[index]?.options.actions?.map((action) => action.text)).toEqual([
        'Approve',
        'Deny',
      ]);
      shown[index]?.action(APPROVE_ACTION_INDEX);
      await settle();
    }

    expect(reviewApproval).toHaveBeenCalledTimes(6);
    expect(deps.answerApproval).not.toHaveBeenCalled();
    expect(deps.openSession).toHaveBeenCalledTimes(3);
    expect(deps.onAnswerFailed).not.toHaveBeenCalled();
  });

  it('sends a Deny from the banner without reading the approval again', async () => {
    const { notifier, deps, shown } = harness();
    notifier.handle('root-1', approval);
    await settle();
    vi.mocked(deps.reviewApproval).mockClear();

    shown[0]?.action(DENY_ACTION_INDEX);
    await settle();

    expect(deps.reviewApproval).not.toHaveBeenCalled();
    expect(deps.answerApproval).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-1', decision: 'deny' }),
    );
  });

  it('opens the session on click where the platform has no notification actions', async () => {
    const { notifier, deps, shown } = harness({ supportsActions: false });
    notifier.handle('root-1', approval);
    await settle();

    expect(shown[0]?.options.actions).toBeUndefined();
    shown[0]?.click();
    expect(deps.openSession).toHaveBeenCalledWith('root-1', 'thread-1');
    expect(deps.answerApproval).not.toHaveBeenCalled();
  });

  it('offers no Approve for a high-risk or irreversible request, only the session', async () => {
    const { notifier, deps, shown } = harness();
    notifier.handle('root-1', { ...approval, requestId: 'req-high', riskLevel: 'high' });
    await settle();
    notifier.handle('root-1', { ...approval, requestId: 'req-final', reversible: false });
    await settle();

    expect(shown.map((entry) => entry.options.actions)).toEqual([undefined, undefined]);
    expect(shown[0]?.options.body).toContain('Open AGI Desktop to review it.');
    shown[1]?.click();
    expect(deps.openSession).toHaveBeenCalledWith('root-1', 'thread-1');
    expect(deps.answerApproval).not.toHaveBeenCalled();
  });

  it('offers no Approve when the CLI did not rate the risk or say it can be undone', async () => {
    const { notifier, shown } = harness();
    notifier.handle('root-1', { ...approval, requestId: 'req-unrated', riskLevel: null });
    await settle();
    notifier.handle('root-1', { ...approval, requestId: 'req-unknown', reversible: null });
    await settle();

    expect(shown.map((entry) => entry.options.actions)).toEqual([undefined, undefined]);
    const request = { summary: 'Run pnpm test', command: 'pnpm test' };
    expect(answerableFromNotification({ ...request, riskLevel: 'medium', reversible: true })).toBe(
      true,
    );
    expect(
      answerableFromNotification({ ...request, riskLevel: 'critical', reversible: true }),
    ).toBe(false);
  });

  it('offers no Approve for what the page and the phone may not answer alone, only the session', async () => {
    const reserved = [
      { request: { ...approvalRequest, kind: 'TrustDirectory', command: null }, reserved: [] },
      { request: approvalRequest, reserved: ['protected-path' as const] },
      { request: approvalRequest, reserved: ['outside-folder' as const] },
      { request: approvalRequest, reserved: ['named-host' as const] },
      { request: { ...approvalRequest, riskLevel: 'high' as const }, reserved: [] },
      { request: { ...approvalRequest, kind: 'Git', command: null }, reserved: [] },
      { request: { ...approvalRequest, kind: 'SomethingNewer', command: null }, reserved: [] },
    ];
    const reviewApproval = vi.fn();
    const { notifier, deps, shown } = harness({ reviewApproval });

    for (const [index, review] of reserved.entries()) {
      reviewApproval.mockResolvedValueOnce(review);
      notifier.handle('root-1', { ...approval, requestId: `req-reserved-${index}` });
      await settle();
    }

    expect(shown).toHaveLength(reserved.length);
    for (const banner of shown) {
      expect(banner.options.actions).toBeUndefined();
      expect(banner.options.body).toContain('Open AGI Desktop to review it.');
    }
    shown[0]?.action(APPROVE_ACTION_INDEX);
    expect(deps.answerApproval).not.toHaveBeenCalled();
    shown[0]?.click();
    expect(deps.openSession).toHaveBeenCalledWith('root-1', 'thread-1');
  });

  it('offers no Approve when the approval cannot be read back from the CLI', async () => {
    const reviewApproval = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('runtime gone'));
    const { notifier, shown } = harness({ reviewApproval });

    notifier.handle('root-1', { ...approval, requestId: 'req-gone' });
    notifier.handle('root-1', { ...approval, requestId: 'req-unreadable' });
    await settle();

    expect(shown.map((entry) => entry.options.actions)).toEqual([undefined, undefined]);
  });

  it('raises nothing for an approval answered while it was being read back', async () => {
    const { notifier, shown } = harness();

    notifier.handle('root-1', approval);
    notifier.handle('root-1', {
      type: 'approval-answered',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'req-1',
      decision: 'deny',
      approved: false,
    });
    await settle();

    expect(shown).toEqual([]);
  });

  it('offers Approve only while the banner shows the whole command', async () => {
    const { notifier, deps, shown } = harness();
    const fits = `echo ${'a'.repeat(95)}`;
    const tooLong = `${fits}; rm -rf build`;
    notifier.handle('root-1', { ...approval, requestId: 'req-fits', command: fits });
    await settle();
    notifier.handle('root-1', { ...approval, requestId: 'req-long', command: tooLong });
    await settle();

    expect(fits).toHaveLength(100);
    expect(shown[0]?.options.actions?.map((action) => action.text)).toEqual(['Approve', 'Deny']);
    expect(shown[0]?.options.body).toContain(`$ ${fits}`);
    expect(shown[1]?.options.actions).toBeUndefined();
    expect(shown[1]?.options.body).not.toContain('rm -rf build');
    expect(shown[1]?.options.body).toContain('Open AGI Desktop to review it.');

    shown[1]?.action(APPROVE_ACTION_INDEX);
    expect(deps.answerApproval).not.toHaveBeenCalled();
    shown[1]?.click();
    expect(deps.openSession).toHaveBeenCalledWith('root-1', 'thread-1');
  });

  it('offers no Approve for a command the banner cannot print as it will run', () => {
    const rated = { summary: 'Run a command', riskLevel: 'low', reversible: true };
    const token = `github_pat_${'c'.repeat(30)}`;

    expect(answerableFromNotification({ ...rated, command: 'pnpm test' })).toBe(true);
    expect(answerableFromNotification({ ...rated, command: null })).toBe(true);
    expect(answerableFromNotification({ ...rated, command: 'ls\nrm -rf build' })).toBe(false);
    expect(answerableFromNotification({ ...rated, command: 'echo  two  spaces' })).toBe(false);
    expect(answerableFromNotification({ ...rated, command: `curl -H ${token} x.test` })).toBe(
      false,
    );
    expect(answerableFromNotification({ ...rated, command: 'echo \u202egnp.exe' })).toBe(false);
    expect(answerableFromNotification({ ...rated, command: null, summary: 'x'.repeat(181) })).toBe(
      false,
    );
  });

  it('shows the command and its risk, redacted and clipped', async () => {
    const { notifier, shown } = harness();
    const token = `github_pat_${'a'.repeat(30)}`;
    notifier.handle('root-1', {
      ...approval,
      requestId: 'req-cmd',
      command: `git push https://${token}@github.com/acme/repo.git ${'x'.repeat(200)}`,
      riskLevel: 'medium',
    });
    await settle();

    const body = shown[0]?.options.body ?? '';
    expect(body).not.toContain(token);
    expect(body).toContain('$ git push');
    expect(body).toContain('Medium risk');
    const commandLine = body.split('\n').find((line) => line.startsWith('$ ')) ?? '';
    expect(commandLine.length).toBeLessThanOrEqual(102);
  });

  it('says a request cannot be undone, and leaves out what the CLI did not say', () => {
    expect(
      approvalBody(
        { summary: 'Delete build/', command: null, riskLevel: null, reversible: false },
        false,
      ),
    ).toBe('Delete build/\nCannot be undone\nOpen AGI Desktop to review it.');
    expect(
      approvalBody(
        { summary: 'Read a file', command: null, riskLevel: null, reversible: null },
        true,
      ),
    ).toBe('Read a file');
  });

  describe('questions', () => {
    const question: DeveloperSessionEvent = {
      type: 'user-input-requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-1',
      question: 'Which branch should I rebase onto?',
    };

    it('notifies with the question, and a click opens the session', () => {
      const { notifier, deps, shown } = harness();
      notifier.handle('root-1', question);

      expect(shown).toHaveLength(1);
      expect(shown[0]?.options.actions).toBeUndefined();
      expect(shown[0]?.options.body).toBe('Which branch should I rebase onto?');
      shown[0]?.click();
      expect(deps.openSession).toHaveBeenCalledWith('root-1', 'thread-1');
      expect(deps.answerApproval).not.toHaveBeenCalled();
    });

    it('withdraws a question answered or cancelled elsewhere, and when the turn ends', async () => {
      const { notifier, shown } = harness();
      notifier.handle('root-1', question);
      notifier.handle('root-1', {
        type: 'user-input-answered',
        threadId: 'thread-1',
        turnId: 'turn-1',
        requestId: 'ask-1',
        cancelled: true,
      });
      await settle();
      expect(shown[0]?.closed).toBe(true);

      notifier.handle('root-1', { ...question, requestId: 'ask-2' });
      notifier.handle('root-1', finished('interrupted'));
      expect(shown[1]?.closed).toBe(true);
    });

    it('has its own mute, and keeps secrets out of the banner', async () => {
      const { notifier, shown, setPreferences } = harness();
      setPreferences({ when: 'always', muted: ['question'], sound: true });
      notifier.handle('root-1', question);
      expect(shown).toHaveLength(0);

      setPreferences({ when: 'always', muted: [], sound: true });
      const token = `github_pat_${'b'.repeat(30)}`;
      notifier.handle('root-1', {
        ...question,
        requestId: 'ask-3',
        question: `Use ${token} to push?`,
      });
      await settle();
      expect(shown[0]?.options.body).not.toContain(token);
    });
  });

  it('opens the session when an answer from the notification fails', async () => {
    const failure = new Error('runtime gone');
    const { notifier, deps, shown } = harness({
      answerApproval: vi.fn(async () => {
        throw failure;
      }),
    });
    notifier.handle('root-1', approval);
    await settle();
    shown[0]?.action(APPROVE_ACTION_INDEX);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deps.onAnswerFailed).toHaveBeenCalledWith(failure);
    expect(deps.openSession).toHaveBeenCalledWith('root-1', 'thread-1');
  });

  it('raises one notification for an event delivered twice', async () => {
    const { notifier, shown } = harness();
    notifier.handle('root-1', approval);
    await settle();
    notifier.handle('root-1', approval);
    await settle();
    notifier.handle('root-1', finished('completed'));
    notifier.handle('root-1', finished('completed'));

    expect(shown).toHaveLength(2);
  });

  it('keeps the same request id in two sessions apart', async () => {
    const { notifier, shown } = harness();
    notifier.handle('root-1', approval);
    await settle();
    notifier.handle('root-2', approval);
    await settle();

    expect(shown).toHaveLength(2);
  });

  it('withdraws an approval answered somewhere else', async () => {
    const { notifier, shown } = harness();
    notifier.handle('root-1', approval);
    await settle();
    notifier.handle('root-1', {
      type: 'approval-answered',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'req-1',
      decision: 'approve_once',
      approved: true,
    });
    await settle();

    expect(shown[0]?.closed).toBe(true);
  });

  it('follows always, unfocused, never, the per-kind mute and the sound switch', async () => {
    const { notifier, shown, setPreferences, setFocused } = harness();
    setFocused(true);
    notifier.handle('root-1', finished('completed', 'turn-a'));
    expect(shown).toHaveLength(0);

    setPreferences({ when: 'always', muted: [], sound: false });
    notifier.handle('root-1', finished('completed', 'turn-b'));
    expect(shown).toHaveLength(1);
    expect(shown[0]?.options.silent).toBe(true);

    setPreferences({ when: 'always', muted: ['turn-failed'], sound: true });
    notifier.handle('root-1', finished('failed', 'turn-c'));
    expect(shown).toHaveLength(1);

    setPreferences({ when: 'never', muted: [], sound: true });
    setFocused(false);
    notifier.handle('root-1', { ...approval, requestId: 'req-9' });
    await settle();
    expect(shown).toHaveLength(1);
  });

  it('draws attention to the app only when asked, only from the background, and only for what notifies', () => {
    const { notifier, deps, setPreferences, setFocused } = harness();
    notifier.handle('root-1', finished('completed', 'turn-a'));
    expect(deps.drawAttention).not.toHaveBeenCalled();

    setPreferences({ when: 'unfocused', muted: ['turn-failed'], sound: true, drawAttention: true });
    notifier.handle('root-1', finished('completed', 'turn-b'));
    expect(deps.drawAttention).toHaveBeenCalledOnce();

    notifier.handle('root-1', finished('failed', 'turn-c'));
    expect(deps.drawAttention).toHaveBeenCalledOnce();

    setPreferences({ when: 'always', muted: [], sound: true, drawAttention: true });
    setFocused(true);
    notifier.handle('root-1', finished('completed', 'turn-d'));
    expect(deps.drawAttention).toHaveBeenCalledOnce();
  });

  it('draws attention where the system shows no banner at all', () => {
    const { notifier, deps, shown, setPreferences } = harness({ supported: () => false });
    setPreferences({ when: 'unfocused', muted: [], sound: true, drawAttention: true });

    notifier.handle('root-1', finished('completed', 'turn-a'));

    expect(shown).toHaveLength(0);
    expect(deps.drawAttention).toHaveBeenCalledOnce();
  });

  it('says what failed, and stays quiet for a turn the user interrupted', () => {
    const { notifier, shown } = harness();
    notifier.handle('root-1', finished('failed', 'turn-a'));
    notifier.handle('root-1', finished('interrupted', 'turn-b'));

    expect(shown).toHaveLength(1);
    expect(shown[0]?.options.body).toBe('The model provider refused the request.');
    expect(shown[0]?.options.title).toContain('agiworkforce');
  });

  it('counts running turns and pending approvals for the tray and badge', async () => {
    const { notifier, deps } = harness();
    notifier.handle('root-1', { type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' });
    notifier.handle('root-1', approval);
    await settle();

    expect(notifier.activity().runningTurns).toHaveLength(1);
    expect(notifier.activity().pendingApprovals).toHaveLength(1);
    expect(deps.onActivityChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pendingApprovals: [expect.objectContaining({ requestId: 'req-1' })],
      }),
    );

    notifier.handle('root-1', finished('completed'));
    expect(notifier.activity()).toEqual({ runningTurns: [], pendingApprovals: [] });

    notifier.handle('root-1', { type: 'turn-started', threadId: 'thread-1', turnId: 'turn-2' });
    notifier.handle('root-1', { type: 'runtime-stopped', message: 'stopped' });
    expect(notifier.activity().runningTurns).toHaveLength(0);
  });
});

it('suppresses routine banners while still tracking approvals, terminal state and cleanup', async () => {
  const { notifier, shown, deps } = harness();
  notifier.handle('root', { type: 'turn-started', threadId: 'thread', turnId: 'turn' });
  notifier.handle(
    'root',
    { type: 'approval-requested', ...approvalRequest, threadId: 'thread', turnId: 'turn' },
    false,
  );
  expect(notifier.activity().runningTurns).toHaveLength(1);
  expect(notifier.activity().pendingApprovals).toHaveLength(1);
  notifier.handle(
    'root',
    {
      type: 'turn-finished',
      threadId: 'thread',
      turnId: 'turn',
      outcome: 'completed',
      response: 'owned result',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
    },
    false,
  );
  await settle();
  expect(shown).toHaveLength(0);
  expect(notifier.activity()).toEqual({ runningTurns: [], pendingApprovals: [] });
  expect(deps.onActivityChanged).toHaveBeenCalled();
});
