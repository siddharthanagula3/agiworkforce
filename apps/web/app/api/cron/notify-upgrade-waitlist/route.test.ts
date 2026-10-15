import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type NeonDb = typeof import('@/lib/server/neon-db');
type NoticeService = typeof import('@/lib/services/upgrade-waitlist-notice-service');

const mocks = vi.hoisted(() => ({
  getNeonDb: vi.fn(),
  notifyUpgradeWaitlist: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDb>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/services/upgrade-waitlist-notice-service', async (importOriginal) => ({
  ...(await importOriginal<NoticeService>()),
  notifyUpgradeWaitlist: mocks.notifyUpgradeWaitlist,
}));

import { GET } from './route';
import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';

const CRON_SECRET = 'upgrade-waitlist-cron-secret-0123456789';
const DB = { query: vi.fn(), execute: vi.fn() };
const SUMMARY = {
  notified: 2,
  emailed: 2,
  undeliverable: 0,
  deferred: 0,
  remaining: false,
  emailChannel: 'available',
};

function cron(secret: string | null = CRON_SECRET) {
  return new NextRequest('https://agiworkforce.com/api/cron/notify-upgrade-waitlist', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  resetCronAuthThrottleForTests();
  mocks.getNeonDb.mockReturnValue(DB);
  mocks.notifyUpgradeWaitlist.mockResolvedValue(SUMMARY);
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/notify-upgrade-waitlist', () => {
  it('refuses a request without the cron secret and emails nobody', async () => {
    expect((await GET(cron(null))).status).toBe(401);
    expect((await GET(cron('not-the-secret'))).status).toBe(401);
    expect(mocks.notifyUpgradeWaitlist).not.toHaveBeenCalled();
  });

  it('tells one batch of waitlisted accounts per run and reports what it did', async () => {
    const response = await GET(cron());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(SUMMARY);
    expect(mocks.notifyUpgradeWaitlist).toHaveBeenCalledWith(DB, expect.any(Number));
    expect(mocks.notifyUpgradeWaitlist.mock.calls[0]?.[1]).toBeGreaterThan(0);
  });

  it('answers 500 when the run fails, so the scheduler records it', async () => {
    mocks.notifyUpgradeWaitlist.mockRejectedValue(new Error('database unavailable'));

    const response = await GET(cron());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
  });
});
