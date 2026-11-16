import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  sendPush: vi.fn(),
  record: vi.fn(),
  track: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../notification-service', () => ({
  recordNotification: (...args: unknown[]) => mocks.record(...args),
}));
vi.mock('../push-notification-service', () => ({
  sendPushToUser: (...args: unknown[]) => mocks.sendPush(...args),
}));
vi.mock('@/lib/server/product-analytics', async (importOriginal) => ({
  ...(await importOriginal<ProductAnalyticsModule>()),
  trackProductAnalyticsEvent: (...args: unknown[]) => mocks.track(...args),
}));

type ProductAnalyticsModule = typeof import('@/lib/server/product-analytics');

import type { AgentRunNotificationEvent } from '../agent-notification-service';

const {
  notifyAgentRunEvent,
  notifyCloudCodeTurnEvent,
  notifyLocalCodeSessionEvent,
  notifyResearchReportSettled,
  trackAgentRunOutcome,
  AGENT_PUSH_PREFERENCE_KEY,
} = await import('../agent-notification-service');

const callerDb = { query: mocks.query } as never;

const notice = {
  userId: 'user-1',
  runId: '0190a000-0000-7000-8000-000000000001',
  event: 'approval_required' as const,
  toolName: 'mcp__github__read_file',
};

function preferences(value: unknown) {
  mocks.query.mockResolvedValue([{ notifications: value }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendPush.mockResolvedValue({ sent: 1, invalidated: 0 });
  mocks.record.mockResolvedValue({ recorded: true });
  preferences({});
});

describe('trackAgentRunOutcome', () => {
  it.each([
    ['completed', 'succeeded'],
    ['failed', 'failed'],
  ] as const)('records a %s run as %s', (event, outcome) => {
    trackAgentRunOutcome({ userId: 'user-1', event });

    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { name: 'work_run_finished', surface: 'web', outcome },
    );
  });

  it('records nothing while a run is only waiting on the user', () => {
    trackAgentRunOutcome({ userId: 'user-1', event: 'approval_required' });
    trackAgentRunOutcome({ userId: 'user-1', event: 'input_required' });

    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('is recorded once when a finished run is announced', async () => {
    await notifyAgentRunEvent(callerDb, { ...notice, event: 'completed', toolName: null });

    expect(mocks.track).toHaveBeenCalledTimes(1);
  });
});

describe('notifyAgentRunEvent, in-app feed', () => {
  it('records the event against the Work run even when mobile push is switched off', async () => {
    preferences({ [AGENT_PUSH_PREFERENCE_KEY]: false });

    await notifyAgentRunEvent(callerDb, notice);

    expect(mocks.record).toHaveBeenCalledWith(
      callerDb,
      expect.objectContaining({
        userId: 'user-1',
        category: 'agent_run',
        severity: 'warning',
        target: { kind: 'work', id: notice.runId },
        dedupeKey: null,
      }),
    );
  });

  it('dedupes a terminal event so a retried step writes one row', async () => {
    await notifyAgentRunEvent(callerDb, { ...notice, event: 'failed', toolName: null });

    expect(mocks.record.mock.calls[0]?.[1]).toMatchObject({
      severity: 'error',
      dedupeKey: `agent-run:${notice.runId}:failed`,
    });
  });
});

describe('notifyAgentRunEvent, consent', () => {
  it('sends when the account has expressed no preference', async () => {
    await expect(notifyAgentRunEvent(callerDb, notice)).resolves.toEqual({ pushed: true });
    expect(mocks.sendPush).toHaveBeenCalledOnce();
  });

  it('sends to both transports when the account has expressed no preference', async () => {
    await notifyAgentRunEvent(callerDb, notice);

    expect(mocks.sendPush.mock.calls[0]?.[2]).toEqual({ expo: true, web: true });
  });

  it('drops the mobile transport, not the browser, when the mobile opt-out is set', async () => {
    preferences({ [AGENT_PUSH_PREFERENCE_KEY]: false });

    await notifyAgentRunEvent(callerDb, notice);

    expect(mocks.sendPush.mock.calls[0]?.[2]).toEqual({ expo: false, web: true });
  });

  it('reports not pushed when the account has no registered device', async () => {
    mocks.sendPush.mockResolvedValue({ sent: 0, invalidated: 0 });

    await expect(notifyAgentRunEvent(callerDb, notice)).resolves.toEqual({ pushed: false });
  });
});

describe('notifyAgentRunEvent, payload the mobile client can route', () => {
  const cases: Array<[AgentRunNotificationEvent, string, string]> = [
    ['approval_required', 'agent_approval_needed', 'high'],
    ['input_required', 'agent_approval_needed', 'high'],
    ['completed', 'task_completed', 'normal'],
    ['failed', 'agent_failed', 'critical'],
  ];

  it.each(cases)('maps %s to the %s type the client switches on', async (event, type, priority) => {
    await notifyAgentRunEvent(callerDb, { ...notice, event });

    expect(mocks.sendPush).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        title: expect.any(String),
        body: expect.any(String),
        data: expect.objectContaining({ type, priority, runId: notice.runId }),
      }),
      expect.anything(),
    );
  });

  it('only ever names a route the client allow-lists', async () => {
    const allowed = [
      '/(app)/companion',
      '/(app)/(tabs)/chat',
      '/(app)/settings',
      '/(app)/notifications',
      '/(app)/schedules',
      '/(app)/tasks',
    ];

    for (const [event] of cases) {
      mocks.sendPush.mockClear();
      await notifyAgentRunEvent(callerDb, { ...notice, event });
      const message = mocks.sendPush.mock.calls[0]?.[1] as { data: Record<string, string> };
      expect(allowed).toContain(message.data['route']);
    }
  });

  it('names the blocked tool when there is one', async () => {
    await notifyAgentRunEvent(callerDb, notice);

    expect(mocks.sendPush).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ body: expect.stringContaining('mcp__github__read_file') }),
      expect.anything(),
    );
  });

  it('falls back to generic copy when no tool name is available', async () => {
    await notifyAgentRunEvent(callerDb, { ...notice, toolName: null });

    expect(mocks.sendPush).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ body: 'Your agent is waiting for your approval.' }),
      expect.anything(),
    );
  });
});

describe('notifyAgentRunEvent, never throws', () => {
  it('sends anyway when the preference lookup fails', async () => {
    mocks.query.mockRejectedValue(new Error('neon down'));

    await expect(notifyAgentRunEvent(callerDb, notice)).resolves.toEqual({ pushed: true });
    expect(mocks.sendPush).toHaveBeenCalledOnce();
  });

  it('swallows a push transport failure', async () => {
    mocks.sendPush.mockRejectedValue(new Error('expo down'));

    await expect(notifyAgentRunEvent(callerDb, notice)).resolves.toEqual({ pushed: false });
  });
});

describe('notifyResearchReportSettled', () => {
  const report = {
    userId: 'user-1',
    reportId: 'report-1',
    requestId: 'req-12345678',
    title: 'Market sizing for home batteries',
    status: 'completed',
    sourcesConsulted: 14,
  };

  it('records a feed row that opens the report and pushes the same words', async () => {
    await expect(notifyResearchReportSettled(callerDb, report)).resolves.toEqual({
      recorded: true,
      pushed: true,
    });

    expect(mocks.record).toHaveBeenCalledWith(callerDb, {
      userId: 'user-1',
      category: 'research',
      severity: 'success',
      title: 'Research report ready',
      message: '“Market sizing for home batteries” is ready, drawn from 14 sources.',
      target: { kind: 'research', id: 'report-1' },
      dedupeKey: 'research:req-12345678:completed',
    });
    expect(mocks.sendPush).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        title: 'Research report ready',
        data: expect.objectContaining({ target: 'research', targetId: 'report-1' }),
      }),
      { expo: true, web: true },
    );
  });

  it('sends a finished report as research, which the phone can mute on its own', async () => {
    await notifyResearchReportSettled(callerDb, {
      ...report,
      conversationId: '0190a000-0000-7000-8000-000000000456',
      runId: 'run-1',
    });

    expect(mocks.sendPush).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        data: {
          type: 'research_completed',
          priority: 'normal',
          route: '/(app)/reports',
          target: 'research',
          targetId: 'report-1',
          conversationId: '0190a000-0000-7000-8000-000000000456',
          runId: 'run-1',
        },
      }),
      { expo: true, web: true },
    );
  });

  it('leaves out the conversation and run when the report names neither', async () => {
    await notifyResearchReportSettled(callerDb, report);

    const message = mocks.sendPush.mock.calls[0]?.[1] as { data: Record<string, string> };
    expect(message.data).toEqual({
      type: 'research_completed',
      priority: 'normal',
      route: '/(app)/reports',
      target: 'research',
      targetId: 'report-1',
    });
  });

  it('keeps a report that did not finish under agent failures', async () => {
    await notifyResearchReportSettled(callerDb, { ...report, status: 'failed' });

    expect(mocks.sendPush).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        title: 'Research did not finish',
        data: expect.objectContaining({ type: 'agent_failed', priority: 'critical' }),
      }),
      { expo: true, web: true },
    );
  });

  it('says nothing while the report is still being written', async () => {
    await notifyResearchReportSettled(callerDb, { ...report, status: 'synthesizing' });
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it('pushes once: a report saved again after it settled is already in the feed', async () => {
    mocks.record.mockResolvedValue({ recorded: false });
    await expect(notifyResearchReportSettled(callerDb, report)).resolves.toEqual({
      recorded: false,
      pushed: false,
    });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });
});

describe('notifyCloudCodeTurnEvent', () => {
  const turn = {
    userId: 'user-1',
    sessionId: 'session-1',
    sessionTitle: 'Fix the login page',
    turnId: 'turn-1',
  };

  it.each([
    ['approval_required', 'code_session_needs_input', 'high'],
    ['completed', 'code_session_completed', 'normal'],
    ['failed', 'code_session_failed', 'critical'],
  ] as const)('sends %s as %s with the session it is about', async (event, type, priority) => {
    await notifyCloudCodeTurnEvent(callerDb, { ...turn, event });

    expect(mocks.sendPush).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        data: { type, priority, codeSessionId: 'session-1' },
      }),
      { expo: true, web: true },
    );
  });
});

describe('notifyLocalCodeSessionEvent', () => {
  const activity = {
    rootId: 'root-1',
    threadId: 'thread-1',
    turnId: 'turn-1',
    sessionTitle: 'Fix the login page',
  };

  it.each([
    ['approval_required', 'warning', 'local-code-turn:turn-1:approval_required:approval-1'],
    ['completed', 'success', 'local-code-turn:turn-1:completed'],
    ['failed', 'error', 'local-code-turn:turn-1:failed'],
  ] as const)(
    'records %s in the account feed, where the inbox expects it',
    async (event, severity, dedupeKey) => {
      await notifyLocalCodeSessionEvent(callerDb, {
        userId: 'user-1',
        deviceName: 'Work laptop',
        activity: { ...activity, event, approvalId: 'approval-1' },
      });

      expect(mocks.record).toHaveBeenCalledTimes(1);
      expect(mocks.record).toHaveBeenCalledWith(callerDb, {
        userId: 'user-1',
        category: 'agent_run',
        severity,
        title: expect.any(String),
        message: expect.stringContaining('Work laptop'),
        dedupeKey,
      });
      expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps each approval of one turn as its own notice', async () => {
    for (const approvalId of ['approval-1', 'approval-2']) {
      await notifyLocalCodeSessionEvent(callerDb, {
        userId: 'user-1',
        deviceName: null,
        activity: { ...activity, event: 'approval_required', approvalId },
      });
    }

    const keys = mocks.record.mock.calls.map(
      (call) => (call[1] as { dedupeKey: string }).dedupeKey,
    );
    expect(new Set(keys).size).toBe(2);
  });

  it('records the notice but sends no push when the phone switch is off', async () => {
    preferences({ [AGENT_PUSH_PREFERENCE_KEY]: false });

    const result = await notifyLocalCodeSessionEvent(callerDb, {
      userId: 'user-1',
      deviceName: null,
      activity: { ...activity, event: 'completed' },
    });

    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.sendPush).not.toHaveBeenCalled();
    expect(result).toEqual({ pushed: false });
  });

  it('still pushes to the phone when the feed cannot be written', async () => {
    mocks.record.mockResolvedValue({ recorded: false, failed: true });

    const result = await notifyLocalCodeSessionEvent(callerDb, {
      userId: 'user-1',
      deviceName: null,
      activity: { ...activity, event: 'failed' },
    });

    expect(mocks.sendPush).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        data: {
          type: 'agent_failed',
          priority: 'critical',
          rootId: 'root-1',
          threadId: 'thread-1',
        },
      }),
      { expo: true, web: false },
    );
    expect(result).toEqual({ pushed: true });
  });
});
