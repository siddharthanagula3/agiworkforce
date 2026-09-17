import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('../notification-service', () => ({
  recordNotification: (...args: unknown[]) => mocks.record(...args),
}));

const { notifyDeviceDisconnected, notifyDeviceSignInApproved } =
  await import('../account-activity-notifications');

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
