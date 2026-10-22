import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendPushToUser: vi.fn(),
  query: vi.fn(),
  claimedScope: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/push-notification-service', () => ({
  sendPushToUser: mocks.sendPushToUser,
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ transaction: vi.fn() }) }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: (_serviceDb: unknown, scope: unknown) => {
    mocks.claimedScope(scope);
    return { query: mocks.query };
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { sendUsageResetReminderStep, USAGE_RESET_REMINDER_NOTICE, USAGE_RESET_REMINDER_TYPE } =
  await import('../steps/send-usage-reset-reminder');
const { usageResetReminderEnabled } = await import('../usage-reset-reminder-preference');

describe('sendUsageResetReminderStep', () => {
  beforeEach(() => {
    mocks.sendPushToUser.mockReset();
    mocks.query.mockReset();
    mocks.claimedScope.mockReset();
    mocks.query.mockResolvedValue([{ enabled: true }]);
  });

  it('tells the account its limit reset and links back to chat', async () => {
    mocks.sendPushToUser.mockResolvedValue({ sent: 2, invalidated: 0 });

    await expect(sendUsageResetReminderStep('user-1')).resolves.toBe(2);

    expect(mocks.sendPushToUser).toHaveBeenCalledWith('user-1', {
      ...USAGE_RESET_REMINDER_NOTICE,
      data: { type: USAGE_RESET_REMINDER_TYPE, url: '/chat' },
    });
  });

  it('reads the preference as the account being notified', async () => {
    mocks.sendPushToUser.mockResolvedValue({ sent: 1, invalidated: 0 });

    await sendUsageResetReminderStep('user-1');

    expect(mocks.claimedScope).toHaveBeenCalledWith({ userId: 'user-1', organizationId: null });
  });

  it('sends nothing when the account turned usage notifications off', async () => {
    mocks.query.mockResolvedValue([{ enabled: false }]);

    await expect(sendUsageResetReminderStep('user-1')).resolves.toBe(0);

    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it('treats an account with no saved preference as opted in', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(usageResetReminderEnabled({ query: mocks.query }, 'user-1')).resolves.toBe(true);
  });
});
