import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/neon-db');
type ScanModule1 = typeof import('@/lib/security-audit');
type ScanModule2 = typeof import('@/lib/services/code-trial-expiry');

const mocks = vi.hoisted(() => ({
  getNeonDb: vi.fn(),
  recordAuditEvent: vi.fn(),
  expireEndedCodeTrials: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/services/code-trial-expiry', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  expireEndedCodeTrials: mocks.expireEndedCodeTrials,
}));

import { GET } from './route';
import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';

const CRON_SECRET = 'code-trial-cron-secret-0123456789abcdefg';
const DB = { query: vi.fn(), execute: vi.fn() };

function cron(secret: string | null = CRON_SECRET) {
  return new NextRequest('https://agiworkforce.com/api/cron/expire-code-trials', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function trials(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    userId: `user_${index}`,
    previousPlanTier: 'pro',
    endedAt: '2026-09-27T00:00:00.000Z',
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  resetCronAuthThrottleForTests();
  mocks.getNeonDb.mockReturnValue(DB);
  mocks.recordAuditEvent.mockResolvedValue(undefined);
  mocks.expireEndedCodeTrials.mockResolvedValue(trials(2));
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/expire-code-trials', () => {
  it('refuses a request without the cron secret and ends no trial', async () => {
    expect((await GET(cron(null))).status).toBe(401);
    expect((await GET(cron('not-the-cron-secret'))).status).toBe(401);
    expect(mocks.expireEndedCodeTrials).not.toHaveBeenCalled();
  });

  it('moves each ended code trial to Free and audits it against its owner', async () => {
    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expired: 2 });
    expect(mocks.expireEndedCodeTrials).toHaveBeenCalledWith(DB, expect.any(Date), 200);
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(2);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_0',
        eventType: 'plan_changed',
        endpoint: '/api/cron/expire-code-trials',
        detail: expect.objectContaining({
          previousPlanTier: 'pro',
          planTier: 'free',
          source: 'code_trial_expiry',
          status: 'canceled',
        }),
      }),
    );
  });

  it('keeps taking batches while they come back full and stops at a short one', async () => {
    mocks.expireEndedCodeTrials.mockResolvedValueOnce(trials(200)).mockResolvedValueOnce(trials(3));

    const response = await GET(cron());

    expect(await response.json()).toEqual({ expired: 203 });
    expect(mocks.expireEndedCodeTrials).toHaveBeenCalledTimes(2);
  });

  it('stops after ten full batches so one run stays inside its time limit', async () => {
    mocks.expireEndedCodeTrials.mockResolvedValue(trials(200));

    const response = await GET(cron());

    expect(await response.json()).toEqual({ expired: 2_000 });
    expect(mocks.expireEndedCodeTrials).toHaveBeenCalledTimes(10);
  });

  it('answers 500 without the cause when a batch fails', async () => {
    mocks.expireEndedCodeTrials.mockRejectedValueOnce(new Error('subscriptions row lock timeout'));

    const response = await GET(cron());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
