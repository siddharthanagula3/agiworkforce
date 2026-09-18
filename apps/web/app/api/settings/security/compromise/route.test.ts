import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  respond: vi.fn(),
  readOpen: vi.fn(),
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mocks.requireCsrfToken(...(args as [])),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/identity', () => ({ getIdentityProvider: () => ({ id: 'identity' }) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...(args as [])),
}));
vi.mock('@/lib/services/identity-events', () => ({
  respondToAccountCompromise: (...args: unknown[]) => mocks.respond(...(args as [])),
  readOpenCompromiseResponse: (...args: unknown[]) => mocks.readOpen(...(args as [])),
}));

import { GET, POST } from './route';

const DB = { query: vi.fn(), execute: vi.fn() };

function get() {
  return GET(new NextRequest('http://localhost/api/settings/security/compromise') as never);
}

function post() {
  return POST(
    new NextRequest('http://localhost/api/settings/security/compromise', {
      method: 'POST',
    }) as never,
  );
}

describe('/api/settings/security/compromise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({
      db: DB,
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('reports no open response when the account has never asked for one', async () => {
    mocks.readOpen.mockResolvedValue(null);

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ response: null });
    expect(mocks.readOpen).toHaveBeenCalledWith(DB, 'user-1');
  });

  it('returns the open response so the panel can show what is still owed', async () => {
    mocks.readOpen.mockResolvedValue({
      responseId: 'res-1',
      trigger: 'reported',
      openedAt: '2026-09-18T00:00:00.000Z',
      passwordResetRequired: true,
      supportPath: '/support',
    });

    const response = await get();

    await expect(response.json()).resolves.toMatchObject({
      response: { responseId: 'res-1', passwordResetRequired: true },
    });
  });

  it('runs the guided response when the owner reports a compromise', async () => {
    mocks.respond.mockResolvedValue({
      responseId: 'res-2',
      sessionsRevoked: 3,
      sessionsFailed: 0,
      passwordResetRequired: true,
      supportPath: '/support',
    });

    const response = await post();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      responseId: 'res-2',
      sessionsRevoked: 3,
    });
    expect(mocks.respond).toHaveBeenCalledWith(
      DB,
      { id: 'identity' },
      expect.objectContaining({ userId: 'user-1', trigger: 'reported', organizationId: 'org-1' }),
    );
  });

  it('refuses a report that carries no CSRF token, and revokes nothing', async () => {
    mocks.requireCsrfToken.mockResolvedValue(
      NextResponse.json({ error: 'csrf' }, { status: 403 }) as never,
    );

    const response = await post();

    expect(response.status).toBe(403);
    expect(mocks.respond).not.toHaveBeenCalled();
  });
});
