import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UNATTENDED_RUN_DENIED_STATUSES,
  ownerMayRunUnattendedSql,
} from '@/lib/auth/account-lifecycle';
import { redactLogRecord } from '@/lib/redaction';

type BillingWaitlistAccessModule = typeof import('@/lib/server/billing-waitlist-access');
type NotificationEmailService = typeof import('../notification-email-service');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  email: vi.fn(),
  record: vi.fn(),
  emailConfigured: vi.fn(),
  upgradesOpen: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/billing-waitlist-access', async (importOriginal) => ({
  ...(await importOriginal<BillingWaitlistAccessModule>()),
  billingUpgradesOpenFor: (...args: unknown[]) => mocks.upgradesOpen(...args),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/billing-notice-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  emailBillingNotice: (...args: unknown[]) => mocks.email(...args),
  recordBillingNotice: (...args: unknown[]) => mocks.record(...args),
}));
vi.mock('@/lib/services/notification-email-service', async (importOriginal) => ({
  ...(await importOriginal<NotificationEmailService>()),
  isNotificationEmailConfigured: () => mocks.emailConfigured(),
}));

const {
  EMAIL_RETRY_BASE_MINUTES,
  MAX_EMAIL_ATTEMPTS,
  notifyUpgradeWaitlist,
  UPGRADE_WAITLIST_OPEN_NOTICE,
} = await import('../upgrade-waitlist-notice-service');

const db = { query: mocks.query, execute: mocks.execute } as never;

interface Account {
  user_id: string;
  plans: string[];
  notified?: boolean;
  email_attempts?: number;
}

function waitlisted(...accounts: Account[]) {
  mocks.query.mockResolvedValue(
    accounts.map((account) => ({ notified: false, email_attempts: 0, ...account })),
  );
}

function refused(status: number) {
  return { delivered: false, reason: 'rejected', status, detail: `${status} refused` };
}

function updates(): Array<{ sql: string; params: unknown[] }> {
  return mocks.execute.mock.calls.map(([sql, params]) => ({
    sql: String(sql).replace(/\s+/g, ' ').trim(),
    params: params as unknown[],
  }));
}

function emailResolutions() {
  return updates().filter(({ sql }) => sql.includes('set upgrade_emailed_at = now()'));
}

function emailAttempts() {
  return updates().filter(({ sql }) => sql.includes('set upgrade_email_attempts = $2'));
}

function toldInApp() {
  return updates().filter(({ sql }) => sql.includes('set upgrade_notified_at = now()'));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '1');
  mocks.emailConfigured.mockReturnValue(true);
  mocks.upgradesOpen.mockResolvedValue(true);
  mocks.email.mockResolvedValue({ delivered: true, providerMessageId: 'msg-1' });
  mocks.record.mockResolvedValue({ recorded: true });
  mocks.execute.mockResolvedValue(1);
  waitlisted({ user_id: 'user-1', plans: ['pro', 'basic'] });
});

afterEach(() => vi.unstubAllEnvs());

describe('notifyUpgradeWaitlist', () => {
  it('tells nobody while paid upgrades are still staged', async () => {
    mocks.upgradesOpen.mockResolvedValue(false);

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({
      notified: 0,
      emailed: 0,
    });
    expect(mocks.upgradesOpen).toHaveBeenCalledWith('user-1');
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it('notifies only the account whose current upgrade switch is open', async () => {
    waitlisted(
      { user_id: 'open-account', plans: ['basic'] },
      { user_id: 'closed-account', plans: ['basic'] },
    );
    mocks.upgradesOpen.mockImplementation(async (userId: string) => userId === 'open-account');
    await notifyUpgradeWaitlist(db, 100);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: 'open-account' }),
    );
    expect(mocks.email).toHaveBeenCalledTimes(1);
  });

  it('tells each account in the app first, then emails it once, naming the plans it joined', async () => {
    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toEqual({
      notified: 1,
      emailed: 1,
      undeliverable: 0,
      deferred: 0,
      remaining: false,
      emailChannel: 'available',
    });

    const notice = mocks.record.mock.calls[0]?.[1];
    expect(notice).toMatchObject({
      userId: 'user-1',
      title: 'You can now upgrade to Basic or Pro',
      message:
        'Paid upgrades are open on AGI. You joined the waitlist for Basic or Pro, and you can upgrade now.',
      dedupeKey: `${UPGRADE_WAITLIST_OPEN_NOTICE}user-1`,
      action: { label: 'See plans', url: expect.stringMatching(/\/pricing$/) },
      promotion: {
        reason:
          'You are receiving this because you joined the AGI waitlist for Basic or Pro. It is the only email about that waitlist.',
      },
    });
    expect(mocks.email).toHaveBeenCalledWith(db, notice);
    expect(mocks.record.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.email.mock.invocationCallOrder[0] as number,
    );
    expect(toldInApp()).toEqual([expect.objectContaining({ params: ['user-1'] })]);
    expect(emailResolutions()).toEqual([expect.objectContaining({ params: ['user-1', null] })]);
  });

  it('emails an account already told in the app without telling it again', async () => {
    waitlisted({ user_id: 'user-1', plans: ['max'], notified: true, email_attempts: 2 });

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({
      notified: 0,
      emailed: 1,
    });
    expect(mocks.record).not.toHaveBeenCalled();
    expect(toldInApp()).toEqual([]);
  });

  it('asks for accounts not yet told, and for email that is due, oldest first', async () => {
    await notifyUpgradeWaitlist(db, 25);

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('count(waitlisted.upgrade_notified_at) = 0');
    expect(sql).toContain('count(waitlisted.upgrade_emailed_at) = 0');
    expect(sql).toContain('from public.beta_redemptions redemption');
    expect(sql).toContain(
      'mins => $2::int * power(2, max(waitlisted.upgrade_email_attempts) - 1)::int',
    );
    expect(sql.replace(/\s+/g, ' ')).toContain(
      'order by count(waitlisted.upgrade_notified_at) > 0, max(waitlisted.upgrade_email_attempted_at) nulls first, min(coalesce(waitlisted.joined_at, waitlisted.created_at))',
    );
    expect(params).toEqual([true, EMAIL_RETRY_BASE_MINUTES, 26, UNATTENDED_RUN_DENIED_STATUSES]);
  });

  it('leaves out accounts that cannot sign in, asked to be deleted, or were erased', async () => {
    await notifyUpgradeWaitlist(db, 25);

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(ownerMayRunUnattendedSql('waitlisted.user_id', 4));
    expect(params[3]).toEqual(UNATTENDED_RUN_DENIED_STATUSES);
    expect(UNATTENDED_RUN_DENIED_STATUSES).toContain('deleted');
  });

  it('records a failed attempt and keeps the email for a later run', async () => {
    mocks.email.mockResolvedValue({ delivered: false, reason: 'timeout', detail: 'timeout' });

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({
      notified: 1,
      emailed: 0,
      deferred: 1,
      emailChannel: 'paused',
    });
    expect(emailAttempts()).toEqual([
      expect.objectContaining({ params: ['user-1', 1, 'timeout'] }),
    ]);
    expect(emailResolutions()).toEqual([]);
  });

  it('reports the email channel under a name the log redaction keeps', async () => {
    mocks.email.mockResolvedValue({ delivered: false, reason: 'timeout', detail: 'timeout' });

    const summary = await notifyUpgradeWaitlist(db, 100);

    expect(Object.values(summary)).toContain('paused');
    expect(redactLogRecord({ ...summary })).toEqual(summary);
  });

  it('pauses email for the run when the provider is busy, and still tells every account in the app', async () => {
    waitlisted({ user_id: 'user-1', plans: ['basic'] }, { user_id: 'user-2', plans: ['pro'] });
    mocks.email.mockResolvedValueOnce(refused(429));

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({
      notified: 2,
      deferred: 1,
      emailChannel: 'paused',
    });
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(emailAttempts()).toEqual([
      expect.objectContaining({ params: ['user-1', 1, 'rejected 429'] }),
    ]);
  });

  it('retries an address whose send collided with another, without pausing the run', async () => {
    waitlisted({ user_id: 'user-1', plans: ['basic'] }, { user_id: 'user-2', plans: ['pro'] });
    mocks.email.mockResolvedValueOnce(refused(409));

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({
      emailed: 1,
      deferred: 1,
      emailChannel: 'available',
    });
    expect(emailAttempts()).toEqual([
      expect.objectContaining({ params: ['user-1', 1, 'rejected 409'] }),
    ]);
  });

  it('gives up on an address the provider refuses for good, and keeps the in-app notice', async () => {
    waitlisted({ user_id: 'user-1', plans: ['basic'] }, { user_id: 'user-2', plans: ['pro'] });
    mocks.email.mockResolvedValueOnce(refused(422));

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({
      notified: 2,
      emailed: 1,
      undeliverable: 1,
      deferred: 0,
    });
    expect(emailResolutions()).toEqual([
      expect.objectContaining({ params: ['user-1', 'rejected 422'] }),
      expect.objectContaining({ params: ['user-2', null] }),
    ]);
    expect(emailAttempts()).toEqual([]);
  });

  it('gives up on an account with no usable address, and keeps the in-app notice', async () => {
    waitlisted({ user_id: 'user-1', plans: ['basic'] }, { user_id: 'user-2', plans: ['max'] });
    mocks.email
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ delivered: false, reason: 'invalid_recipient', detail: 'invalid' });

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({
      notified: 2,
      undeliverable: 2,
    });
    expect(emailResolutions()).toEqual([
      expect.objectContaining({ params: ['user-1', 'no_address'] }),
      expect.objectContaining({ params: ['user-2', 'invalid_recipient'] }),
    ]);
  });

  it('stops emailing when the provider refuses the sender, and marks no account for it', async () => {
    waitlisted({ user_id: 'user-1', plans: ['basic'] }, { user_id: 'user-2', plans: ['pro'] });
    mocks.email.mockResolvedValueOnce(refused(403));

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({
      notified: 2,
      emailed: 0,
      undeliverable: 0,
      deferred: 0,
      emailChannel: 'refused',
    });
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(emailAttempts()).toEqual([]);
    expect(emailResolutions()).toEqual([]);
  });

  it('gives up after the last attempt, so a failing address cannot hold the queue', async () => {
    waitlisted({
      user_id: 'user-1',
      plans: ['pro'],
      notified: true,
      email_attempts: MAX_EMAIL_ATTEMPTS - 1,
    });
    mocks.email.mockResolvedValue({ delivered: false, reason: 'network', detail: 'reset' });

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({ undeliverable: 1 });
    expect(emailResolutions()).toEqual([
      expect.objectContaining({ params: ['user-1', 'network'] }),
    ]);
  });

  it('tells accounts in the app when no email sender is configured, and asks for nothing else', async () => {
    mocks.emailConfigured.mockReturnValue(false);

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({
      notified: 1,
      emailed: 0,
      emailChannel: 'not_configured',
    });
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      false,
      EMAIL_RETRY_BASE_MINUTES,
      101,
      UNATTENDED_RUN_DENIED_STATUSES,
    ]);
    expect(mocks.email).not.toHaveBeenCalled();
    expect(toldInApp()).toEqual([expect.objectContaining({ params: ['user-1'] })]);
  });

  it('works through one batch per run and says when more are waiting', async () => {
    waitlisted({ user_id: 'user-1', plans: ['basic'] }, { user_id: 'user-2', plans: ['pro'] });

    await expect(notifyUpgradeWaitlist(db, 1)).resolves.toMatchObject({
      notified: 1,
      emailed: 1,
      remaining: true,
    });
    expect(mocks.email).toHaveBeenCalledTimes(1);
  });

  it('carries on with the next account when one fails', async () => {
    waitlisted({ user_id: 'user-1', plans: ['basic'] }, { user_id: 'user-2', plans: ['pro'] });
    mocks.email.mockRejectedValueOnce(new Error('profile read failed'));

    await expect(notifyUpgradeWaitlist(db, 100)).resolves.toMatchObject({
      notified: 2,
      emailed: 1,
      deferred: 1,
    });
  });
});
