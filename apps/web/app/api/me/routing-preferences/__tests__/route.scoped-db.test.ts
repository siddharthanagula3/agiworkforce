import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));

const scopedDb = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
const ownerDb = vi.hoisted(() => vi.fn());
const getUserScopedDb = vi.hoisted(() =>
  vi.fn(async () => ({ db: scopedDb, userId: 'user_123', organizationId: null })),
);
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: ownerDb }));

import { GET, PUT } from '../route';

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/me/routing-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('routing-preferences route reads and writes under row-level security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserScopedDb.mockResolvedValue({ db: scopedDb, userId: 'user_123', organizationId: null });
    scopedDb.execute.mockResolvedValue(1);
  });

  it('GET reads routing_preferences through the policy-scoped client', async () => {
    scopedDb.query.mockResolvedValue([{ routing_preferences: { us_only: true } }]);

    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/me/routing-preferences'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ us_only: true });
    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(scopedDb.query).toHaveBeenCalledWith(
      'select routing_preferences from profiles where id = $1 limit 1',
      ['user_123'],
    );
    expect(ownerDb).not.toHaveBeenCalled();
  });

  it('PUT writes routing_preferences through the policy-scoped client', async () => {
    const response = await PUT(jsonRequest({ us_only: true }));

    expect(response.status).toBe(200);
    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(scopedDb.execute).toHaveBeenCalledWith(
      'update profiles set routing_preferences = $1::jsonb, updated_at = now() where id = $2',
      [JSON.stringify({ us_only: true }), 'user_123'],
    );
    expect(ownerDb).not.toHaveBeenCalled();
  });
});
