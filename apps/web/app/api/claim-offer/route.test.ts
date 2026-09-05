import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({ query: vi.fn(), allocate: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { allocateCreditsForPeriod: (...a: unknown[]) => mocks.allocate(...a) },
}));

import { POST } from './route';

const INVITE = {
  id: '11111111-1111-4111-8111-111111111111',
  plan_tier: 'pro',
  trial_days: 14,
  discount_percent: null,
};

function post(code = 'AGIBETA1234') {
  return new NextRequest('https://agiworkforce.com/api/claim-offer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allocate.mockResolvedValue(undefined);
});

describe('POST /api/claim-offer', () => {
  it('reads the RPC result out of the json column, not the row', async () => {
    mocks.query
      .mockResolvedValueOnce([INVITE])
      .mockResolvedValueOnce([
        {
          result: {
            success: true,
            error: null,
            subscription_id: 'sub-1',
            plan_tier: 'pro',
            trial_days: 14,
            discount_percent: null,
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'sub-1',
          plan_tier: 'pro',
          status: 'trialing',
          current_period_start: '2026-08-01T00:00:00.000Z',
          current_period_end: '2026-08-15T00:00:00.000Z',
        },
      ]);

    const response = await POST(post());

    expect(response.status).toBe(200);
    const [sql] = mocks.query.mock.calls[1]!;
    expect(sql, 'a json-returning function must be aliased, not expanded').toContain(
      'claim_beta_invite($1, $2, $3) as result',
    );
    expect(sql).not.toContain('select * from claim_beta_invite');
  });

  it('surfaces the function’s own refusal instead of a generic failure', async () => {
    mocks.query
      .mockResolvedValueOnce([INVITE])
      .mockResolvedValueOnce([
        { result: { success: false, error: 'you have already claimed an offer' } },
      ]);

    const response = await POST(post());

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain('already claimed');
  });

  it('does not allocate credits when the claim was refused', async () => {
    mocks.query
      .mockResolvedValueOnce([INVITE])
      .mockResolvedValueOnce([{ result: { success: false, error: 'invite has expired' } }]);

    await POST(post());

    expect(mocks.allocate).not.toHaveBeenCalled();
  });
});

describe('claim_beta_invite contract', () => {
  it('still returns json, which is what forces the aliased read above', () => {
    const sql = readFileSync(join(process.cwd(), 'db/neon/0020_functions.sql'), 'utf8');
    const start = sql.indexOf('create or replace function public.claim_beta_invite(');
    expect(start).toBeGreaterThan(-1);
    const signature = sql.slice(start, start + 400);
    expect(
      signature,
      'if this becomes a TABLE/SETOF function the route must go back to select *',
    ).toMatch(/\)\s*returns json/u);
  });
});
