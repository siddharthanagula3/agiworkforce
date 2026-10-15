import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type Logger = typeof import('@/lib/logger');
type NotificationEmailService = typeof import('../notification-email-service');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  insertNotice: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Logger>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/notification-email-service', async (importOriginal) => ({
  ...(await importOriginal<NotificationEmailService>()),
  isNotificationEmailConfigured: () => false,
}));

const { notifyUpgradeWaitlist } = await import('../upgrade-waitlist-notice-service');

const db = { query: mocks.query, execute: mocks.execute } as never;

function markedTold(): unknown[][] {
  return mocks.execute.mock.calls.filter(([sql]) =>
    String(sql).includes('set upgrade_notified_at = now()'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '1');
  mocks.execute.mockResolvedValue(1);
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('insert into public.notifications')) return mocks.insertNotice(params);
    return [{ user_id: 'user-1', plans: ['basic'], notified: false, email_attempts: 0 }];
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('notifyUpgradeWaitlist in the app', () => {
  it('marks an account told only once its notice is in the notification feed', async () => {
    mocks.insertNotice.mockResolvedValue([{ id: 'notice-1' }]);

    await expect(notifyUpgradeWaitlist(db, 10)).resolves.toMatchObject({
      notified: 1,
      deferred: 0,
    });
    expect(markedTold()).toHaveLength(1);
  });

  it('defers an account whose notice could not be written, so the next run tells it', async () => {
    mocks.insertNotice.mockRejectedValue(new Error('statement timeout'));

    await expect(notifyUpgradeWaitlist(db, 10)).resolves.toMatchObject({
      notified: 0,
      deferred: 1,
    });
    expect(markedTold()).toEqual([]);
  });

  it('counts a notice an earlier run already wrote as told', async () => {
    mocks.insertNotice.mockResolvedValue([]);

    await expect(notifyUpgradeWaitlist(db, 10)).resolves.toMatchObject({
      notified: 1,
      deferred: 0,
    });
    expect(markedTold()).toHaveLength(1);
  });
});
