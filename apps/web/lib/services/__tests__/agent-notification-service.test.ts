import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), sendPush: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../push-notification-service', () => ({
  sendPushToUser: (...args: unknown[]) => mocks.sendPush(...args),
}));

import type { AgentRunNotificationEvent } from '../agent-notification-service';

const { notifyAgentRunEvent, AGENT_PUSH_PREFERENCE_KEY } =
  await import('../agent-notification-service');

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
  preferences({});
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
    ['input_required', 'agent_paused', 'high'],
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
      '/(app)/agents',
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
