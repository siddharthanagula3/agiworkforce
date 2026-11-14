import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  insertNotification: vi.fn(),
  sendPushToUser: vi.fn(),
  scoped: vi.fn(),
  withdrawNotification: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/jobs/job-service', async (importOriginal) => ({
  ...(await importOriginal<JobServiceModule>()),
  enqueueJob: (...args: unknown[]) => mocks.enqueueJob(...args),
}));
vi.mock('@/lib/auth/account-lifecycle', () => ({
  UNATTENDED_RUN_DENIED_STATUSES: ['suspended'],
  ownerMayRunUnattendedSql: (column: string, param: number) => `account_ok(${column}, $${param})`,
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: (...args: unknown[]) => mocks.scoped(...args),
}));
vi.mock('../notification-service', () => ({
  insertNotification: (...args: unknown[]) => mocks.insertNotification(...args),
  withdrawNotification: (...args: unknown[]) => mocks.withdrawNotification(...args),
}));
vi.mock('../push-notification-service', () => ({
  sendPushToUser: (...args: unknown[]) => mocks.sendPushToUser(...args),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { BackgroundJob } from '@/lib/jobs/job-service';
import type { JobHandlerContext } from '@/lib/jobs/job-drain';
import { RELEASES, releaseSlug } from '@/lib/changelog-entries';
import {
  PRODUCT_UPDATE_JOB_KIND,
  PRODUCT_UPDATE_PAGE_BUDGET_MS,
  PRODUCT_UPDATE_PAGE_SIZE,
  deliverProductUpdatePage,
  findAnnounceableRelease,
  startProductUpdateAnnouncement,
} from '../product-update-notification-service';

type JobServiceModule = typeof import('@/lib/jobs/job-service');

const RELEASE = RELEASES[0]!;
const SLUG = releaseSlug(RELEASE);

function database(): DatabaseAdapter & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter & { query: ReturnType<typeof vi.fn> };
}

function context(
  db: DatabaseAdapter,
  payload: Record<string, unknown>,
  signal: AbortSignal = new AbortController().signal,
  isFinalAttempt = false,
): JobHandlerContext {
  return {
    db,
    signal,
    isFinalAttempt,
    job: { payload, userId: null, organizationId: null } as unknown as BackgroundJob,
  };
}

function accounts(count: number, from = 0): Array<{ user_id: string }> {
  return Array.from({ length: count }, (_, index) => ({
    user_id: `user_${String(from + index).padStart(4, '0')}`,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enqueueJob.mockResolvedValue({ id: 'job-1', status: 'queued', created: true });
  mocks.insertNotification.mockResolvedValue('inserted');
  mocks.sendPushToUser.mockResolvedValue({ sent: 1, invalidated: 0 });
  mocks.scoped.mockImplementation((_db: unknown, scope: unknown) => ({ scope }));
  mocks.withdrawNotification.mockResolvedValue(true);
});

describe('which release can be announced', () => {
  it('accepts a published release note by its name', () => {
    expect(findAnnounceableRelease(SLUG)).toBe(RELEASE);
  });

  it.each([['made-up-release'], ['../etc'], [''], [42], [null], ['x'.repeat(65)]])(
    'refuses %p',
    (slug) => {
      expect(findAnnounceableRelease(slug)).toBeNull();
    },
  );
});

describe('startProductUpdateAnnouncement', () => {
  it('queues the first page under one key for the release', async () => {
    const db = database();

    await expect(startProductUpdateAnnouncement(db, SLUG)).resolves.toEqual({
      status: 'started',
      release: SLUG,
      jobId: 'job-1',
    });
    expect(mocks.enqueueJob).toHaveBeenCalledWith(db, {
      kind: PRODUCT_UPDATE_JOB_KIND,
      idempotencyKey: `product-update:${SLUG}`,
      payload: { release: SLUG, after: null },
    });
  });

  it('refuses a second start while the first is on record', async () => {
    const db = database();
    mocks.enqueueJob.mockResolvedValue({ id: 'job-1', status: 'running', created: false });

    await expect(startProductUpdateAnnouncement(db, SLUG)).resolves.toEqual({
      status: 'already_announced',
      release: SLUG,
    });
  });

  it('reads no account data to decide', async () => {
    const db = database();

    await startProductUpdateAnnouncement(db, SLUG);

    expect(db.query).not.toHaveBeenCalled();
  });

  it('never queues an unknown release', async () => {
    const db = database();
    await expect(startProductUpdateAnnouncement(db, 'made-up')).resolves.toEqual({
      status: 'unknown_release',
    });
    expect(db.query).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });
});

describe('deliverProductUpdatePage', () => {
  it('reads only accounts in good standing with a device that turned product updates on', async () => {
    const db = database();
    db.query.mockResolvedValue(accounts(2));

    await deliverProductUpdatePage(context(db, { release: SLUG, after: null }));

    const [sql, params] = db.query.mock.calls[0]!;
    expect(String(sql)).toContain(
      "(device.push_preferences -> 'eventTypes' -> $1) = 'true'::jsonb",
    );
    expect(String(sql)).toContain('account_ok(device.user_id, $4)');
    expect(params).toEqual(['product_update', null, PRODUCT_UPDATE_PAGE_SIZE + 1, ['suspended']]);
  });

  it('records then pushes each account once, phone only, through the push service', async () => {
    const db = database();
    db.query.mockResolvedValue(accounts(2));

    const result = await deliverProductUpdatePage(context(db, { release: SLUG, after: null }));

    expect(result).toEqual({ release: SLUG, considered: 2, announced: 2, pushed: 2, next: null });
    expect(mocks.insertNotification).toHaveBeenCalledWith(
      { scope: { userId: 'user_0000', organizationId: null } },
      expect.objectContaining({
        userId: 'user_0000',
        category: 'general',
        title: RELEASE.headline,
        message: RELEASE.body[0],
        dedupeKey: `product-update:${SLUG}`,
      }),
    );
    expect(mocks.withdrawNotification).not.toHaveBeenCalled();
    expect(mocks.sendPushToUser).toHaveBeenCalledWith(
      'user_0000',
      {
        title: RELEASE.headline,
        body: 'Tap to read what is new.',
        data: { type: 'product_update', release: SLUG },
      },
      { expo: true, web: false },
    );
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('skips an account that already has this announcement', async () => {
    const db = database();
    db.query.mockResolvedValue(accounts(1));
    mocks.insertNotification.mockResolvedValue('duplicate');

    const result = await deliverProductUpdatePage(context(db, { release: SLUG, after: null }));

    expect(result.announced).toBe(0);
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it('works in bounded pages and queues the next one after the last account', async () => {
    const db = database();
    db.query.mockResolvedValue(accounts(PRODUCT_UPDATE_PAGE_SIZE + 1));

    const result = await deliverProductUpdatePage(context(db, { release: SLUG, after: null }));

    const last = `user_${String(PRODUCT_UPDATE_PAGE_SIZE - 1).padStart(4, '0')}`;
    expect(result.considered).toBe(PRODUCT_UPDATE_PAGE_SIZE);
    expect(result.next).toBe(last);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(db, {
      kind: PRODUCT_UPDATE_JOB_KIND,
      idempotencyKey: expect.stringMatching(
        new RegExp(`^product-update:${SLUG}:after:[0-9a-f]{32}$`),
      ),
      payload: { release: SLUG, after: last },
    });
  });

  it('stops early when the page runs out of time and resumes from there', async () => {
    const db = database();
    db.query.mockResolvedValue(accounts(5));
    let clock = 0;
    const now = () => {
      const value = clock;
      clock += PRODUCT_UPDATE_PAGE_BUDGET_MS;
      return value;
    };

    const result = await deliverProductUpdatePage(context(db, { release: SLUG, after: null }), now);

    expect(result.considered).toBe(1);
    expect(result.next).toBe('user_0000');
  });

  it.each([
    ['the push service throws', () => Promise.reject(new Error('expo is down'))],
    [
      'the provider rejects the request',
      () => Promise.resolve({ sent: 0, invalidated: 0, transportFailures: 1 }),
    ],
    [
      'the device list cannot be read',
      () => Promise.resolve({ sent: 0, invalidated: 0, error: 'token_lookup_failed' }),
    ],
  ])('takes the entry back and runs the page again when %s', async (_label, outcome) => {
    const db = database();
    db.query.mockResolvedValue(accounts(2));
    mocks.sendPushToUser.mockImplementationOnce(outcome);

    await expect(
      deliverProductUpdatePage(context(db, { release: SLUG, after: null })),
    ).rejects.toThrow(/1 account\(s\); this page will run again/);

    expect(mocks.withdrawNotification).toHaveBeenCalledTimes(1);
    expect(mocks.withdrawNotification).toHaveBeenCalledWith(
      { scope: { userId: 'user_0000', organizationId: null } },
      'user_0000',
      `product-update:${SLUG}`,
    );
    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['the account has no device to reach or is in quiet hours', { sent: 0, invalidated: 0 }],
    ['the push is held for later', { sent: 0, invalidated: 0, deferred: true }],
    [
      'one device was reached and another request failed',
      { sent: 1, invalidated: 0, transportFailures: 1 },
    ],
  ])('keeps the entry and does not run again when %s', async (_label, delivery) => {
    const db = database();
    db.query.mockResolvedValue(accounts(1));
    mocks.sendPushToUser.mockResolvedValue(delivery);

    const result = await deliverProductUpdatePage(context(db, { release: SLUG, after: null }));

    expect(result).toMatchObject({ announced: 1, pushed: delivery.sent });
    expect(mocks.withdrawNotification).not.toHaveBeenCalled();
  });

  it('queues the next page before asking for this one to run again', async () => {
    const db = database();
    db.query.mockResolvedValue(accounts(PRODUCT_UPDATE_PAGE_SIZE + 1));
    mocks.sendPushToUser.mockRejectedValueOnce(new Error('expo is down'));

    await expect(
      deliverProductUpdatePage(context(db, { release: SLUG, after: null })),
    ).rejects.toThrow(/this page will run again/);

    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
  });

  it('leaves the entry in the list on the last try instead of failing the job', async () => {
    const db = database();
    db.query.mockResolvedValue(accounts(2));
    mocks.sendPushToUser.mockRejectedValueOnce(new Error('expo is down'));

    const result = await deliverProductUpdatePage(
      context(db, { release: SLUG, after: null }, new AbortController().signal, true),
    );

    expect(result).toMatchObject({ announced: 2, pushed: 1 });
    expect(mocks.withdrawNotification).not.toHaveBeenCalled();
  });

  it('keeps the entry without another try when it cannot be taken back', async () => {
    const db = database();
    db.query.mockResolvedValue(accounts(1));
    mocks.sendPushToUser.mockRejectedValueOnce(new Error('expo is down'));
    mocks.withdrawNotification.mockRejectedValueOnce(new Error('database unavailable'));

    const result = await deliverProductUpdatePage(context(db, { release: SLUG, after: null }));

    expect(result).toMatchObject({ announced: 1, pushed: 0 });
  });

  it('stops without sending when the job was cancelled', async () => {
    const db = database();
    db.query.mockResolvedValue(accounts(2));
    const controller = new AbortController();
    controller.abort();

    await expect(
      deliverProductUpdatePage(context(db, { release: SLUG, after: null }, controller.signal)),
    ).rejects.toThrow();
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it('refuses a job that names no known release', async () => {
    const db = database();
    await expect(
      deliverProductUpdatePage(context(db, { release: 'made-up', after: null })),
    ).rejects.toThrow(/no known release/);
    expect(db.query).not.toHaveBeenCalled();
  });
});
