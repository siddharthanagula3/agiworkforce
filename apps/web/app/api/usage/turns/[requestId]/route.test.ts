// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MICROUSD_PER_CREDIT } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/server/rls-db');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/cors');

const mocks = vi.hoisted(() => ({ userScopedDb: vi.fn(), query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getUserScopedDb: (...args: unknown[]) => mocks.userScopedDb(...args),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimitHandler: (handler: unknown) => handler,
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute: (handler: unknown) => handler,
}));

import { ApiKeyScopeError } from '@/lib/api-key-scope-error';
import { IpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { MfaRequiredError } from '@/lib/mfa-policy-gate';
import { GET } from './route';

const USER = 'user_2abcDEF';
const KEY = 'agi.api.turn-2026-09-27.0001';

function read(requestId: string) {
  return GET(new NextRequest(`http://localhost:3000/api/usage/turns/${requestId}`), {
    params: Promise.resolve({ requestId }),
  });
}

beforeEach(() => {
  mocks.userScopedDb.mockResolvedValue({
    db: { query: mocks.query },
    userId: USER,
    organizationId: null,
  });
  mocks.query.mockResolvedValue([]);
});

describe('GET /api/usage/turns/[requestId]', () => {
  it('reports the settled cost of a request in credits, looked up by its Idempotency-Key', async () => {
    mocks.query.mockResolvedValue([
      { status: 'completed', cost_microusd: String(3.5 * MICROUSD_PER_CREDIT) },
    ]);

    const response = await read(KEY);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      requestId: KEY,
      status: 'settled',
      credits: 3.5,
    });
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('from public.managed_usage_requests');
    expect(sql).toContain('user_id = $1');
    expect(params).toEqual([USER, KEY]);
    expect(mocks.userScopedDb).toHaveBeenCalledWith(expect.anything(), {
      apiKeyScope: 'usage:read',
    });
  });

  it.each(['released', 'declined'])(
    'reports a %s request as settled at what it actually cost',
    async (status) => {
      mocks.query.mockResolvedValue([{ status, cost_microusd: '0' }]);

      await expect((await read(KEY)).json()).resolves.toEqual({
        requestId: KEY,
        status: 'settled',
        credits: 0,
      });
    },
  );

  it.each(['reserving', 'reserved', 'provider_started', 'outcome_unknown'])(
    'states no figure for a %s request, since its cost is not final',
    async (status) => {
      mocks.query.mockResolvedValue([{ status, cost_microusd: String(MICROUSD_PER_CREDIT) }]);

      await expect((await read(KEY)).json()).resolves.toEqual({
        requestId: KEY,
        status: 'pending',
        credits: null,
      });
    },
  );

  it('answers 404 for a request that is not on this account', async () => {
    const response = await read(KEY);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it.each([
    ['shorter than eight characters', 'turn-1'],
    ['carrying characters a key cannot hold', 'turn/2026/0001'],
  ])('refuses an ID %s before reading anything', async (_case, requestId) => {
    const response = await read(requestId);

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(
      'The request ID is the Idempotency-Key the request was sent with',
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('answers 500 without the database message when the read fails', async () => {
    mocks.query.mockRejectedValue(new Error('relation "managed_usage_requests" does not exist'));

    const response = await read(KEY);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('managed_usage_requests');
  });

  it('refuses a caller who is not signed in', async () => {
    mocks.userScopedDb.mockRejectedValue(new Error('no session'));

    const response = await read(KEY);

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an API key without the usage read scope',
      new ApiKeyScopeError('API key does not have the required scope'),
    ],
    [
      'a workspace that requires MFA',
      new MfaRequiredError('Multi-factor authentication is required'),
    ],
    ['an address outside the workspace allow list', new IpNotAllowedError()],
  ])(
    'passes through the refusal for %s rather than reporting a sign-in problem',
    async (_case, error) => {
      mocks.userScopedDb.mockRejectedValue(error);

      const response = await read(KEY);

      expect(response.status).toBe(403);
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );
});
