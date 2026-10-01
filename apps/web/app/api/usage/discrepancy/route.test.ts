// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/api-auth');
type ScanModule2 = typeof import('@/lib/csrf');
type ScanModule3 = typeof import('@/lib/rate-limit');
type ScanModule4 = typeof import('@/lib/server/rls-db');
type ScanModule5 = typeof import('@/lib/support/tickets/service');
type ScanModule6 = typeof import('@/lib/services/account-usage-history-service');
type ScanModule7 = typeof import('@/lib/services/managed-usage-summary-service');

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  csrf: vi.fn(),
  rateLimit: vi.fn(),
  userScopedDb: vi.fn(),
  history: vi.fn(),
  records: vi.fn(),
  summary: vi.fn(),
  openTicket: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getClerkAuthUser: (...args: unknown[]) => mocks.auth(...args),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  requireCsrfToken: (...args: unknown[]) => mocks.csrf(...args),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  withRateLimit: (...args: unknown[]) => mocks.rateLimit(...args),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getUserScopedDb: (...args: unknown[]) => mocks.userScopedDb(...args),
}));
vi.mock('@/lib/support/tickets/service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  openTicket: (...args: unknown[]) => mocks.openTicket(...args),
}));
vi.mock('@/lib/services/account-usage-history-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  readAccountUsageHistory: (...args: unknown[]) => mocks.history(...args),
  readAccountUsageRecords: (...args: unknown[]) => mocks.records(...args),
}));
vi.mock('@/lib/services/managed-usage-summary-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  getManagedUsageSummary: (...args: unknown[]) => mocks.summary(...args),
}));

import { createError } from '@/lib/errors';
import { MAX_TICKET_MESSAGE_CHARS } from '@/lib/support/tickets/service';
import { POST } from './route';

const USER = 'user_2abcDEF';
const DB = { query: vi.fn() };
const DISPUTED = '0190a000-0000-7000-8000-0000000000aa';
const FROM = '2026-08-01T00:00:00.000Z';
const TO = '2026-08-31T00:00:00.000Z';

const HISTORY = {
  userId: USER,
  from: FROM,
  to: TO,
  granularity: 'day',
  totals: { requests: 9, inputTokens: 900, outputTokens: 270, credits: 12.5 },
  periods: [
    { start: '2026-08-21T00:00:00.000Z', requests: 4, credits: 5 },
    { start: '2026-08-22T00:00:00.000Z', requests: 5, credits: 7.5 },
  ],
  byWorkload: [
    { key: 'chat', label: null, requests: 9, inputTokens: 900, outputTokens: 270, credits: 12.5 },
  ],
  byModel: [
    {
      key: 'model-a',
      label: null,
      requests: 9,
      inputTokens: 900,
      outputTokens: 270,
      credits: 12.5,
    },
  ],
  byProject: [],
  freshness: { asOf: TO, latestActivityAt: null, unsettledRequests: 1 },
};

function window(allowance: number, used: number, resetAt: string | null = null) {
  return { allowance, used, remaining: allowance - used, reset_at: resetAt };
}

function summary(credits: Record<string, unknown> = {}) {
  return {
    plan_tier: 'pro',
    usage_percentage: 20,
    usage_reset_at: '2026-09-01T00:00:00.000Z',
    has_usage_remaining: true,
    period_start: FROM,
    period_end: '2026-09-01T00:00:00.000Z',
    subscription_status: 'active',
    session_usage_percentage: 0,
    session_reset_at: null,
    weekly_usage_percentage: 0,
    weekly_reset_at: null,
    flagship_weekly_usage_percentage: 0,
    flagship_weekly_reset_at: null,
    credits: {
      monthly: window(2_000, 400, '2026-09-01T00:00:00.000Z'),
      weekly: window(500, 120),
      five_hour: window(50, 12.25),
      flagship_weekly: window(150, 0),
      purchased: { remaining: 423.7, overage_enabled: true },
      bonus: { remaining: 60, next_expiry_at: '2026-10-15T12:00:00.000Z' },
      purchase_expiry: null,
      ...credits,
    },
  };
}

function report(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/usage/discrepancy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function filedMessage(): string {
  const [input] = mocks.openTicket.mock.calls[0] as [{ message: string }];
  return input.message;
}

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: USER, email: 'reader@example.com' });
  mocks.csrf.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.userScopedDb.mockResolvedValue({ db: DB, userId: USER, organizationId: null });
  mocks.history.mockResolvedValue(HISTORY);
  mocks.records.mockResolvedValue([]);
  mocks.summary.mockResolvedValue(summary());
  mocks.openTicket.mockResolvedValue({
    ticket: { id: 'ticket-1', subject: 'Billing discrepancy: usage from 2026-08-01 to 2026-08-31' },
    staffNotified: true,
  });
});

describe('POST /api/usage/discrepancy', () => {
  it('files the report with the usage record for the window attached, in credits', async () => {
    const response = await POST(
      report({ from: FROM, to: TO, message: '  Charged twice for one turn  ' }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      ticket: {
        id: 'ticket-1',
        subject: 'Billing discrepancy: usage from 2026-08-01 to 2026-08-31',
      },
      staffNotified: true,
    });
    expect(mocks.history).toHaveBeenCalledWith(DB, USER, { from: FROM, to: TO }, 'day');
    expect(mocks.summary).toHaveBeenCalledWith(DB, USER);
    expect(mocks.records).not.toHaveBeenCalled();

    expect(mocks.openTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        name: 'reader@example.com',
        email: 'reader@example.com',
        subject: 'Billing discrepancy: usage from 2026-08-01 to 2026-08-31',
      }),
    );
    const message = filedMessage();
    expect(message.startsWith('Charged twice for one turn\n\n')).toBe(true);
    for (const line of [
      'Usage record attached by the server when this report was filed.',
      'Window: 2026-08-01 to 2026-08-31 (UTC)',
      'Settled: 9 requests, 12.5 credits',
      'Still settling: 1 requests',
      '  2026-08-22: 5 requests, 7.5 credits',
      '  model-a: 9 requests, 12.5 credits',
      '  chat: 9 requests, 12.5 credits',
      '  Plan: Pro',
      '  5-hour window: used 12.25 credits of 50 credits',
      '  Week: used 120 credits of 500 credits',
      '  Month: used 400 credits of 2,000 credits, resets 2026-09-01T00:00:00.000Z',
      '  Bonus credits: 60 credits, next expiry 2026-10-15T12:00:00.000Z',
      '  Purchased credits: 423.7 credits',
    ]) {
      expect(message).toContain(line);
    }
    expect(message.indexOf('2026-08-22:')).toBeLessThan(message.indexOf('2026-08-21:'));
    expect(message).not.toMatch(/\$|cents|microusd/iu);
  });

  it('files the charge or invoice reference beside the note', async () => {
    await POST(report({ from: FROM, to: TO, message: 'Missing refund', reference: 'INV-2044' }));

    expect(filedMessage()).toContain(
      'Missing refund\n\nCharge or invoice reference: INV-2044\n\nUsage record attached',
    );
  });

  it('attaches the disputed request, looked up across the whole retained history', async () => {
    mocks.records.mockResolvedValue([
      {
        requestId: DISPUTED,
        createdAt: '2026-08-22T10:00:00.000Z',
        finalizedAt: '2026-08-22T10:00:04.000Z',
        workload: 'work',
        operation: null,
        model: 'model-a',
        projectId: null,
        projectName: null,
        inputTokens: 1_200,
        outputTokens: 300,
        credits: 3.456,
      },
    ]);

    const response = await POST(
      report({ from: FROM, to: TO, message: 'This one looks high', requestId: DISPUTED }),
    );

    expect(response.status).toBe(201);
    const [db, userId, lookup, options] = mocks.records.mock.calls[0] as [
      unknown,
      string,
      { from: string; to: string },
      unknown,
    ];
    expect(db).toBe(DB);
    expect(userId).toBe(USER);
    expect(new Date(lookup.from).getTime()).toBeLessThan(new Date(FROM).getTime());
    expect(options).toEqual({ requestId: DISPUTED, limit: 1 });
    const message = filedMessage();
    expect(message).toContain(`Disputed request ${DISPUTED}`);
    expect(message).toContain(
      '  created 2026-08-22T10:00:00.000Z, settled 2026-08-22T10:00:04.000Z',
    );
    expect(message).toContain('  model model-a, product area work');
    expect(message).toContain('  1200 input tokens, 300 output tokens, 3.46 credits');
  });

  it('refuses a request ID that is not a settled request on this account', async () => {
    const response = await POST(
      report({ from: FROM, to: TO, message: 'This one looks high', requestId: DISPUTED }),
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(
      'That request ID is not a settled request on this account.',
    );
    expect(mocks.openTicket).not.toHaveBeenCalled();
  });

  it('says a balance it could not read was unreadable rather than zero', async () => {
    mocks.summary.mockResolvedValue(
      summary({ bonus: null, purchased: { remaining: null, overage_enabled: false } }),
    );

    await POST(report({ from: FROM, to: TO, message: 'Balance looks wrong' }));

    const message = filedMessage();
    expect(message).toContain('  Bonus credits: could not be read');
    expect(message).toContain('  Purchased credits: could not be read');
  });

  it('names only the plan for an account whose allowance is set by contract', async () => {
    mocks.summary.mockResolvedValue({ ...summary(), plan_tier: 'enterprise', credits: undefined });

    await POST(report({ from: FROM, to: TO, message: 'Invoice mismatch' }));

    const message = filedMessage();
    expect(message).toContain('Balances at filing\n  Plan: Enterprise');
    expect(message).not.toContain('Month:');
  });

  it.each([
    ['a missing note', { from: FROM, to: TO }],
    ['a blank note', { from: FROM, to: TO, message: '   ' }],
    [
      'a note longer than half a ticket',
      { from: FROM, to: TO, message: 'x'.repeat(MAX_TICKET_MESSAGE_CHARS / 2 + 1) },
    ],
    ['a window bound that is not a timestamp', { from: 'last week', to: TO, message: 'Wrong' }],
    [
      'a request ID that is not a UUID',
      { from: FROM, to: TO, message: 'Wrong', requestId: 'turn-1' },
    ],
  ])('refuses %s and files nothing', async (_case, body) => {
    const response = await POST(report(body));

    expect(response.status).toBe(400);
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.openTicket).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const response = await POST(report('{not json'));

    expect(response.status).toBe(400);
    expect(mocks.openTicket).not.toHaveBeenCalled();
  });

  it('asks for an email address before filing, since support replies by email', async () => {
    mocks.auth.mockResolvedValue({ userId: USER, email: null });

    const response = await POST(report({ from: FROM, to: TO, message: 'Wrong' }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(
      'Add an email address to your account so support can reply.',
    );
    expect(mocks.openTicket).not.toHaveBeenCalled();
  });

  it('refuses a request without a valid CSRF token before reading anything', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    const response = await POST(report({ from: FROM, to: TO, message: 'Wrong' }));

    expect(response.status).toBe(403);
    expect(mocks.userScopedDb).not.toHaveBeenCalled();
    expect(mocks.openTicket).not.toHaveBeenCalled();
  });

  it('shares the support ticket write limit and files nothing once it is spent', async () => {
    mocks.rateLimit.mockResolvedValue(NextResponse.json({ error: 'slow down' }, { status: 429 }));

    const response = await POST(report({ from: FROM, to: TO, message: 'Wrong' }));

    expect(response.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'support-tickets-write',
      `user:${USER}`,
    );
    expect(mocks.openTicket).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not signed in', async () => {
    mocks.auth.mockRejectedValue(createError.unauthorized('Authentication required'));

    const response = await POST(report({ from: FROM, to: TO, message: 'Wrong' }));

    expect(response.status).toBe(401);
    expect(mocks.openTicket).not.toHaveBeenCalled();
  });

  it('files nothing when the usage record cannot be read', async () => {
    mocks.history.mockRejectedValue(new Error('relation "managed_usage_requests" does not exist'));

    const response = await POST(report({ from: FROM, to: TO, message: 'Wrong' }));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('managed_usage_requests');
    expect(mocks.openTicket).not.toHaveBeenCalled();
  });
});
