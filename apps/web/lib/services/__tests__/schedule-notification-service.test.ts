import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Opt-in gating for schedule notifications, push and email.
 *
 * Installing the app registers a device; that is not the same as agreeing to be
 * pushed, and having an account is not agreeing to be emailed. The failure
 * worth guarding is the one that cannot be taken back — notifying a user who
 * never enabled it — so the default and every degraded path must resolve to OFF.
 *
 * The channels are also INDEPENDENT: one provider failing must not suppress the
 * other, or a flaky push service would silently cost the user their email too.
 */

const mocks = vi.hoisted(() => ({ query: vi.fn(), sendPush: vi.fn(), sendEmail: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mocks.query }) }));
vi.mock('../push-notification-service', () => ({
  sendPushToUser: (...args: unknown[]) => mocks.sendPush(...args),
}));
vi.mock('../notification-email-service', () => ({
  sendScheduleCompletionEmail: (...args: unknown[]) => mocks.sendEmail(...args),
}));

const { notifyScheduleCompleted, SCHEDULE_PUSH_PREFERENCE_KEY, SCHEDULE_EMAIL_PREFERENCE_KEY } =
  await import('../schedule-notification-service');

const notice = {
  userId: 'user-1',
  taskId: 'task-1',
  taskName: 'Daily report',
  status: 'success' as const,
};

/** Stored `notifications` namespace for the account. */
function preferences(value: unknown, email: string | null = 'user@example.test') {
  mocks.query.mockResolvedValue([{ notifications: value, email }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendPush.mockResolvedValue({ sent: 1, invalidated: 0 });
  mocks.sendEmail.mockResolvedValue({ delivered: true, providerMessageId: 'msg-1' });
  preferences({ [SCHEDULE_PUSH_PREFERENCE_KEY]: true });
});

describe('notifyScheduleCompleted — consent', () => {
  it('sends when the user enabled it', async () => {
    const result = await notifyScheduleCompleted(notice);

    expect(result.pushed).toBe(true);
    expect(mocks.sendPush).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: expect.any(String) }),
    );
  });

  it('sends nothing when the preference is absent', async () => {
    // The default must be OFF. A user who installed the app never agreed to
    // this, and defaulting to on is the one mistake that cannot be undone.
    preferences({});

    await expect(notifyScheduleCompleted(notice)).resolves.toEqual({
      pushed: false,
      emailed: false,
    });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it('sends nothing when the account has no settings row', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(notifyScheduleCompleted(notice)).resolves.toEqual({
      pushed: false,
      emailed: false,
    });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it('treats a non-boolean preference as off', async () => {
    preferences({ [SCHEDULE_PUSH_PREFERENCE_KEY]: 'yes' });

    await expect(notifyScheduleCompleted(notice)).resolves.toEqual({
      pushed: false,
      emailed: false,
    });
  });

  it('fails CLOSED when settings cannot be read', async () => {
    // A settings outage must not start sending notifications nobody enabled.
    mocks.query.mockRejectedValue(new Error('db down'));

    await expect(notifyScheduleCompleted(notice)).resolves.toEqual({
      pushed: false,
      emailed: false,
    });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });
});

describe('notifyScheduleCompleted — content', () => {
  it('names failure as failure', async () => {
    await notifyScheduleCompleted({ ...notice, status: 'failed' });

    const message = mocks.sendPush.mock.calls[0]![1] as { title: string; body: string };
    expect(message.title).toMatch(/failed/i);
    expect(message.body).toContain('Daily report');
  });

  it('distinguishes a timeout', async () => {
    await notifyScheduleCompleted({ ...notice, status: 'timeout' });

    expect((mocks.sendPush.mock.calls[0]![1] as { body: string }).body).toMatch(/timed out/i);
  });

  it('carries deep-link material but never task output', async () => {
    await notifyScheduleCompleted(notice);

    const message = mocks.sendPush.mock.calls[0]![1] as { data: Record<string, string> };
    // Notifications render on a lock screen; scheduled runs can produce anything.
    expect(message.data).toEqual({ type: 'schedule_run', taskId: 'task-1' });
  });

  it('truncates a very long task name', async () => {
    await notifyScheduleCompleted({ ...notice, taskName: 'x'.repeat(200) });

    const body = (mocks.sendPush.mock.calls[0]![1] as { body: string }).body;
    expect(body.length).toBeLessThan(120);
    expect(body).toContain('…');
  });

  it('says nothing for a run the user cancelled themselves', async () => {
    await expect(notifyScheduleCompleted({ ...notice, status: 'cancelled' })).resolves.toEqual({
      pushed: false,
      emailed: false,
    });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });
});

describe('notifyScheduleCompleted — never throws', () => {
  it('swallows a push failure', async () => {
    // The run is already finalized; a notification problem must not change the
    // recorded outcome of the work.
    mocks.sendPush.mockRejectedValue(new Error('expo down'));

    await expect(notifyScheduleCompleted(notice)).resolves.toEqual({
      pushed: false,
      emailed: false,
    });
  });

  it('reports not-pushed when no device accepted it', async () => {
    mocks.sendPush.mockResolvedValue({ sent: 0, invalidated: 1 });
    preferences({ [SCHEDULE_PUSH_PREFERENCE_KEY]: true });

    await expect(notifyScheduleCompleted(notice)).resolves.toMatchObject({ pushed: false });
  });

  it('still emails when push fails', async () => {
    // The channels are independent; one failing must not suppress the other.
    mocks.sendPush.mockRejectedValue(new Error('expo down'));
    preferences({
      [SCHEDULE_PUSH_PREFERENCE_KEY]: true,
      [SCHEDULE_EMAIL_PREFERENCE_KEY]: true,
    });

    await expect(notifyScheduleCompleted(notice)).resolves.toEqual({
      pushed: false,
      emailed: true,
    });
  });

  it('still pushes when email fails', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('resend down'));
    preferences({
      [SCHEDULE_PUSH_PREFERENCE_KEY]: true,
      [SCHEDULE_EMAIL_PREFERENCE_KEY]: true,
    });

    await expect(notifyScheduleCompleted(notice)).resolves.toEqual({
      pushed: true,
      emailed: false,
    });
  });

  it('sends no email when the account has no address', async () => {
    preferences({ [SCHEDULE_EMAIL_PREFERENCE_KEY]: true }, null);

    await expect(notifyScheduleCompleted(notice)).resolves.toEqual({
      pushed: false,
      emailed: false,
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
