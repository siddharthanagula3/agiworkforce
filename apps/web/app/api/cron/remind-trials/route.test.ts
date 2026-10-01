import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/neon-db');
type ScanModule1 = typeof import('@/lib/server/stripe-client');
type ScanModule2 = typeof import('@/lib/services/trial-reminder-service');

const mocks = vi.hoisted(() => ({
  getNeonDb: vi.fn(),
  getStripeClientOrNull: vi.fn(),
  remindConvertingTrials: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/server/stripe-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getStripeClientOrNull: mocks.getStripeClientOrNull,
}));
vi.mock('@/lib/services/trial-reminder-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  remindConvertingTrials: mocks.remindConvertingTrials,
}));

import { GET } from './route';
import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';

const CRON_SECRET = 'trial-reminder-cron-secret-0123456789abc';
const DB = { query: vi.fn(), execute: vi.fn() };
const STRIPE = { id: 'stripe-client' };

function cron(secret: string | null = CRON_SECRET) {
  return new NextRequest('https://agiworkforce.com/api/cron/remind-trials', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  resetCronAuthThrottleForTests();
  mocks.getNeonDb.mockReturnValue(DB);
  mocks.getStripeClientOrNull.mockReturnValue(STRIPE);
  mocks.remindConvertingTrials.mockResolvedValue({
    reminded: 3,
    skipped: 1,
    failed: 0,
    remaining: false,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/remind-trials', () => {
  it('refuses a request without the cron secret and emails nobody', async () => {
    expect((await GET(cron(null))).status).toBe(401);
    expect((await GET(cron('not-the-secret'))).status).toBe(401);
    expect(mocks.remindConvertingTrials).not.toHaveBeenCalled();
  });

  it('reminds at most 100 converting trials and reports the outcome', async () => {
    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reminded: 3, skipped: 1, failed: 0, remaining: false });
    expect(mocks.remindConvertingTrials).toHaveBeenCalledWith(DB, STRIPE, 100);
  });

  it('says why nothing was sent when Stripe is not configured', async () => {
    mocks.getStripeClientOrNull.mockReturnValueOnce(null);

    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reminded: 0, reason: 'stripe_not_configured' });
    expect(mocks.remindConvertingTrials).not.toHaveBeenCalled();
  });

  it('reports failed reminders and a run that hit its ceiling', async () => {
    mocks.remindConvertingTrials.mockResolvedValueOnce({
      reminded: 99,
      skipped: 0,
      failed: 1,
      remaining: true,
    });

    const response = await GET(cron());

    expect(await response.json()).toMatchObject({ failed: 1, remaining: true });
  });

  it('answers 500 without the cause when the sweep throws', async () => {
    mocks.remindConvertingTrials.mockRejectedValueOnce(new Error('resend 429'));

    const response = await GET(cron());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
