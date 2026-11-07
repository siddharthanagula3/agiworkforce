import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('../notification-service', () => ({
  recordNotification: (...args: unknown[]) => mocks.record(...args),
}));

const {
  notifyAccountCompromiseContained,
  notifyDeviceDisconnected,
  notifyDeviceSignInApproved,
  notifyIdentitySecurityEvent,
} = await import('../account-activity-notifications');
const { IDENTITY_SECURITY_EVENT_KEYS, IDENTITY_SECURITY_EVENTS } =
  await import('../identity-events/catalogue');

const db = {} as never;

beforeEach(() => {
  mocks.record.mockReset();
  mocks.record.mockResolvedValue({ recorded: true });
});

describe('account activity notifications', () => {
  it('records a device sign-in as a security event that opens linked devices', async () => {
    await notifyDeviceSignInApproved(db, { userId: 'user-1', deviceRef: 'abc123def456' });

    expect(mocks.record).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      category: 'security',
      severity: 'warning',
      title: 'A new device signed in to your account',
      message: expect.stringContaining('If this was not you'),
      target: { kind: 'settings', id: 'account' },
      dedupeKey: 'device-sign-in:abc123def456',
    });
  });

  it('names the disconnected device, or its kind when it has no name', async () => {
    await notifyDeviceDisconnected(db, {
      userId: 'user-1',
      deviceId: 'dev-1',
      kind: 'desktop',
      name: 'Studio Mac',
    });
    await notifyDeviceDisconnected(db, {
      userId: 'user-1',
      deviceId: 'dev-2',
      kind: 'mobile',
      name: null,
    });

    expect(mocks.record.mock.calls.map(([, notice]) => notice.title)).toEqual([
      'Studio Mac was disconnected',
      'A phone was disconnected',
    ]);
    expect(mocks.record.mock.calls[1]![1]).toMatchObject({
      category: 'device',
      dedupeKey: 'device-disconnected:dev-2',
    });
  });
});

describe('identity security notifications', () => {
  it('notifies the account holder for every identity security event', async () => {
    for (const event of IDENTITY_SECURITY_EVENT_KEYS) {
      await notifyIdentitySecurityEvent(db, { userId: 'user-1', event });
    }

    expect(mocks.record).toHaveBeenCalledTimes(IDENTITY_SECURITY_EVENT_KEYS.length);
    for (const [index, event] of IDENTITY_SECURITY_EVENT_KEYS.entries()) {
      const spec = IDENTITY_SECURITY_EVENTS[event];
      expect(mocks.record.mock.calls[index]![1]).toEqual({
        userId: 'user-1',
        category: spec.category,
        severity: spec.severity,
        title: spec.title,
        message: spec.message,
        target: { kind: 'settings', id: spec.settingsSection },
        dedupeKey: `identity:${event}:account`,
      });
    }
  });

  it('gives the notice a distinct dedupe key and the call site sentence', async () => {
    await notifyIdentitySecurityEvent(db, {
      userId: 'user-1',
      event: 'new_location',
      subjectRef: 'session-9',
      context: 'The sign-in came from Germany.',
    });

    expect(mocks.record).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      category: 'security',
      severity: 'warning',
      title: 'A sign-in from a new place',
      message: expect.stringContaining('The sign-in came from Germany.'),
      target: { kind: 'settings', id: 'security' },
      dedupeKey: 'identity:new_location:session-9',
    });
  });

  it.each([
    { sessionsRevoked: 0, count: '0 sessions' },
    { sessionsRevoked: 1, count: '1 session' },
    { sessionsRevoked: 3, count: '3 sessions' },
  ])(
    'records the observed $count without a containment guarantee',
    async ({ sessionsRevoked, count }) => {
      for (const cleanupIncomplete of [false, true]) {
        mocks.record.mockClear();
        await notifyAccountCompromiseContained(db, {
          userId: 'product-account',
          responseId: 'resp-1',
          sessionsRevoked,
          cleanupIncomplete,
        });

        expect(mocks.record).toHaveBeenCalledExactlyOnceWith(db, {
          userId: 'product-account',
          category: 'security',
          severity: 'error',
          title: cleanupIncomplete
            ? 'Account security response needs attention'
            : 'Account security response',
          message:
            `We signed out ${count} after a possible account compromise. ` +
            'Review your sign-in methods and active sessions.' +
            (cleanupIncomplete
              ? ' We could not confirm that all cleanup steps finished. Contact support for help with unresolved access.'
              : ''),
          target: { kind: 'settings', id: 'security' },
          dedupeKey: 'account-compromise:resp-1',
        });
        const notice = mocks.record.mock.calls[0]![1];
        expect(`${notice.title} ${notice.message}`).not.toMatch(
          /account was secured|other session|every session|all sessions|password|all providers|try again|retry/i,
        );
      }
    },
  );

  it('leaves an unrecorded compromise notice to the existing notification transport', async () => {
    mocks.record.mockResolvedValueOnce({ recorded: false });

    await expect(
      notifyAccountCompromiseContained(db, {
        userId: 'user-1',
        responseId: 'resp-1',
        sessionsRevoked: 0,
        cleanupIncomplete: true,
      }),
    ).resolves.toBeUndefined();

    expect(mocks.record).toHaveBeenCalledTimes(1);
  });

  it('propagates compromise notice recording failure to the caller', async () => {
    const failure = new Error('notification recording unavailable');
    mocks.record.mockRejectedValueOnce(failure);

    await expect(
      notifyAccountCompromiseContained(db, {
        userId: 'user-1',
        responseId: 'resp-1',
        sessionsRevoked: 1,
        cleanupIncomplete: true,
      }),
    ).rejects.toBe(failure);

    expect(mocks.record).toHaveBeenCalledTimes(1);
  });

  it('every event opens a settings section that exists', async () => {
    const sections = new Set(
      IDENTITY_SECURITY_EVENT_KEYS.map((event) => IDENTITY_SECURITY_EVENTS[event].settingsSection),
    );
    expect([...sections].sort()).toEqual(['account', 'security']);
  });
});
