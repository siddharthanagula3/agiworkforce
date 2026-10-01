import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
type ScanModule0 = typeof import('@/lib/rate-limit');
type ScanModule1 = typeof import('@/lib/security-audit');
type ScanModule2 = typeof import('@/lib/server/neon-db');
type ScanModule3 = typeof import('@/lib/server/stripe-client');
type ScanModule4 = typeof import('@/lib/services/trial-reminder-service');

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  getNeonDb: vi.fn(),
  getStripeClientOrNull: vi.fn(),
  cancelTrialFromLink: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/server/stripe-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getStripeClientOrNull: mocks.getStripeClientOrNull,
}));
vi.mock('@/lib/services/trial-reminder-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  cancelTrialFromLink: mocks.cancelTrialFromLink,
}));

import { POST } from './route';

const DB = { query: vi.fn(), execute: vi.fn() };
const STRIPE = { id: 'stripe-client' };
const TOKEN = 'signed.trial-cancel.token';

const CANCELLED = {
  state: 'cancelled',
  plan: 'Pro',
  endsAt: '2026-10-04T00:00:00.000Z',
  userId: 'user_trial',
  subscriptionId: 'sub_trial',
  planTier: 'pro',
  changed: true,
} as const;

function post(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/trial/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.recordAuditEvent.mockResolvedValue(undefined);
  mocks.getNeonDb.mockReturnValue(DB);
  mocks.getStripeClientOrNull.mockReturnValue(STRIPE);
  mocks.cancelTrialFromLink.mockResolvedValue(CANCELLED);
});

describe('POST /api/trial/cancel', () => {
  it('cancels the trial the reminder link names and audits it against its owner', async () => {
    const response = await POST(post({ token: TOKEN }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: 'cancelled',
      plan: 'Pro',
      endsAt: '2026-10-04T00:00:00.000Z',
    });
    expect(mocks.cancelTrialFromLink).toHaveBeenCalledWith(DB, STRIPE, TOKEN);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_trial',
        eventType: 'plan_changed',
        detail: expect.objectContaining({
          resourceId: 'sub_trial',
          source: 'trial_reminder_link',
          planTier: 'pro',
          status: 'cancel_scheduled',
        }),
      }),
    );
  });

  it('answers a second click with the same result and no second audit entry', async () => {
    mocks.cancelTrialFromLink.mockResolvedValueOnce({ ...CANCELLED, changed: false });

    const response = await POST(post({ token: TOKEN }));

    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['no token', {}],
    ['an empty token', { token: '' }],
    ['a token over 2,048 characters', { token: 'x'.repeat(2_049) }],
    ['an unexpected field', { token: TOKEN, userId: 'someone_else' }],
  ])('rejects %s before touching billing', async (_label, body) => {
    const response = await POST(post(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: 'This cancel link is not valid.' },
    });
    expect(mocks.cancelTrialFromLink).not.toHaveBeenCalled();
  });

  it('refuses a link whose signature or lifetime does not check out', async () => {
    mocks.cancelTrialFromLink.mockResolvedValueOnce({ state: 'invalid' });

    const response = await POST(post({ token: TOKEN }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        message:
          'This cancel link has expired or is not valid. Sign in and cancel from Settings > Billing.',
      },
    });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('answers 409 for a trial that has already ended', async () => {
    mocks.cancelTrialFromLink.mockResolvedValueOnce({ state: 'ended' });

    const response = await POST(post({ token: TOKEN }));

    expect(response.status).toBe(409);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('says billing is unavailable when Stripe is not configured', async () => {
    mocks.getStripeClientOrNull.mockReturnValueOnce(null);

    const response = await POST(post({ token: TOKEN }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { message: 'Billing is unavailable right now. Nothing was changed.' },
    });
    expect(mocks.cancelTrialFromLink).not.toHaveBeenCalled();
  });

  it('asks for a retry when the cancellation fails in Stripe', async () => {
    mocks.cancelTrialFromLink.mockRejectedValueOnce(new Error('stripe 500'));

    const response = await POST(post({ token: TOKEN }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { message: 'Your trial could not be cancelled right now. Please try again.' },
    });
  });

  it('answers with the rate limiter before reading the link', async () => {
    mocks.withRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    );

    const response = await POST(post({ token: TOKEN }));

    expect(response.status).toBe(429);
    expect(mocks.cancelTrialFromLink).not.toHaveBeenCalled();
  });
});
