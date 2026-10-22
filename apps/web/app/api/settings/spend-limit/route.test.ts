import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
type RlsModule = typeof import('@/lib/server/rls-db');
type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type SpendModule = typeof import('@/lib/services/spend-limit-service');

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  readPersonalSpendState: vi.fn(),
  upsertPersonalSpendLimit: vi.fn(),
  deletePersonalSpendLimit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsModule>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/services/spend-limit-service', async (importOriginal) => ({
  ...(await importOriginal<SpendModule>()),
  readPersonalSpendState: mocks.readPersonalSpendState,
  upsertPersonalSpendLimit: mocks.upsertPersonalSpendLimit,
  deletePersonalSpendLimit: mocks.deletePersonalSpendLimit,
}));

import { DELETE, GET, PUT } from './route';
import { createError } from '@/lib/errors';

const USER_ID = 'user_cap';
const DB = { query: vi.fn(), execute: vi.fn() };
const STATE = {
  configured: true,
  monthlyCapCredits: 2_000,
  spentCredits: 500,
  remainingCredits: 1_500,
  overCap: false,
  resetsAt: '2026-11-01T00:00:00.000Z',
};

function request(method: 'GET' | 'PUT' | 'DELETE', body?: unknown) {
  return new NextRequest('https://agiworkforce.com/api/settings/spend-limit', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: USER_ID, organizationId: null });
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.readPersonalSpendState.mockResolvedValue(STATE);
  mocks.upsertPersonalSpendLimit.mockResolvedValue(undefined);
  mocks.deletePersonalSpendLimit.mockResolvedValue(true);
});

describe('GET /api/settings/spend-limit', () => {
  it('reads the caller limit through the caller-scoped connection, never a workspace', async () => {
    const response = await GET(request('GET'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: STATE });
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.readPersonalSpendState).toHaveBeenCalledWith(DB, USER_ID);
  });

  it('refuses a caller with no session', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    const response = await GET(request('GET'));

    expect(response.status).toBe(401);
    expect(mocks.readPersonalSpendState).not.toHaveBeenCalled();
  });

  it('reports a failed read as an error rather than as no limit', async () => {
    mocks.readPersonalSpendState.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await GET(request('GET'));

    expect(response.status).toBeGreaterThanOrEqual(500);
  });
});

describe('PUT /api/settings/spend-limit', () => {
  it('saves a whole number of credits for the caller and returns the new state', async () => {
    const response = await PUT(request('PUT', { monthlyCapCredits: 2_000 }));

    expect(response.status).toBe(200);
    expect(mocks.upsertPersonalSpendLimit).toHaveBeenCalledWith(DB, USER_ID, 2_000);
    expect(await response.json()).toEqual({ state: STATE });
  });

  it.each([
    [{ monthlyCapCredits: 0 }],
    [{ monthlyCapCredits: 12.5 }],
    [{ monthlyCapCredits: '2000' }],
    [{ monthlyCapCredits: 2_000, userId: 'someone_else' }],
    [{}],
  ])('rejects %j without writing', async (body) => {
    const response = await PUT(request('PUT', body));

    expect(response.status).toBe(400);
    expect(mocks.upsertPersonalSpendLimit).not.toHaveBeenCalled();
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'CSRF' } }, { status: 403 }),
    );

    const response = await PUT(request('PUT', { monthlyCapCredits: 2_000 }));

    expect(response.status).toBe(403);
    expect(mocks.upsertPersonalSpendLimit).not.toHaveBeenCalled();
  });

  it('answers with the rate limiter when the caller is over it', async () => {
    mocks.withRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    );

    const response = await PUT(request('PUT', { monthlyCapCredits: 2_000 }));

    expect(response.status).toBe(429);
    expect(mocks.upsertPersonalSpendLimit).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/settings/spend-limit', () => {
  it('removes the caller limit behind the CSRF check', async () => {
    mocks.readPersonalSpendState.mockResolvedValueOnce({
      ...STATE,
      configured: false,
      monthlyCapCredits: null,
      remainingCredits: null,
    });

    const response = await DELETE(request('DELETE'));

    expect(response.status).toBe(200);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), USER_ID);
    expect(mocks.deletePersonalSpendLimit).toHaveBeenCalledWith(DB, USER_ID);
    expect((await response.json()).state.configured).toBe(false);
  });
});
