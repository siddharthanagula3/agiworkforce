import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sendPushToUser: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/push-notification-service', () => ({
  sendPushToUser: mocks.sendPushToUser,
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { sendUsageResetReminderStep, USAGE_RESET_REMINDER_NOTICE, USAGE_RESET_REMINDER_TYPE } =
  await import('../steps/send-usage-reset-reminder');

describe('sendUsageResetReminderStep', () => {
  it('tells the account its limit reset and links back to chat', async () => {
    mocks.sendPushToUser.mockResolvedValue({ sent: 2, invalidated: 0 });

    await expect(sendUsageResetReminderStep('user-1')).resolves.toBe(2);

    expect(mocks.sendPushToUser).toHaveBeenCalledWith('user-1', {
      ...USAGE_RESET_REMINDER_NOTICE,
      data: { type: USAGE_RESET_REMINDER_TYPE, url: '/chat' },
    });
  });
});
