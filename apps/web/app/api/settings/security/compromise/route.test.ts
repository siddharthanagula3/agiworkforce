import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  respond: vi.fn(),
  readOpen: vi.fn(),
  resolve: vi.fn(),
  requireCsrfToken: vi.fn(async () => null),
  requireStepUp: vi.fn(),
  getRequestIdentity: vi.fn(),
  hasEnrolledSecondFactor: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mocks.requireCsrfToken(...(args as [])),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/identity', () => ({
  getRequestIdentity: (...args: unknown[]) => mocks.getRequestIdentity(...(args as [])),
  getIdentityProvider: () => ({ id: 'identity' }),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...(args as [])),
}));
vi.mock('@/lib/server/step-up-auth', () => ({
  requireStepUp: (...args: unknown[]) => mocks.requireStepUp(...(args as [])),
}));
vi.mock('@/lib/server/step-up/verify-factor', () => ({
  hasEnrolledSecondFactor: (...args: unknown[]) => mocks.hasEnrolledSecondFactor(...(args as [])),
}));
vi.mock('@/lib/services/identity-events', () => ({
  respondToAccountCompromise: (...args: unknown[]) => mocks.respond(...(args as [])),
  readOpenCompromiseResponse: (...args: unknown[]) => mocks.readOpen(...(args as [])),
  resolveCompromiseResponse: (...args: unknown[]) => mocks.resolve(...(args as [])),
}));

import { createError } from '@/lib/errors';
import { GET, PATCH, POST } from './route';

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

function patch(body: unknown = { responseId: 'res-1' }) {
  return PATCH(
    new NextRequest('http://localhost/api/settings/security/compromise', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
    mocks.requireStepUp.mockResolvedValue({ method: 'totp' });
    mocks.hasEnrolledSecondFactor.mockResolvedValue(true);
    mocks.getRequestIdentity.mockResolvedValue({ sessionId: 'sess-new' });
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
    // Reporting is the protective act, and someone locked out of their second
    // factor is exactly who needs it.
    expect(mocks.requireStepUp).not.toHaveBeenCalled();
    expect(mocks.hasEnrolledSecondFactor).not.toHaveBeenCalled();
  });

  it('refuses a report that carries no CSRF token, and revokes nothing', async () => {
    mocks.requireCsrfToken.mockResolvedValue(
      NextResponse.json({ error: 'csrf' }, { status: 403 }) as never,
    );

    const response = await post();

    expect(response.status).toBe(403);
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it('closes an open response behind a second factor and returns what was ended', async () => {
    mocks.resolve.mockResolvedValue({
      status: 'resolved',
      responseId: 'res-1',
      outstanding: [],
      sessionsEnded: 2,
      supportPath: '/support',
    });

    const response = await patch();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'resolved',
      sessionsEnded: 2,
    });
    expect(mocks.requireStepUp).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'security.compromise_resolve',
        resourceId: 'res-1',
      }),
    );
    expect(mocks.resolve).toHaveBeenCalledWith(
      DB,
      { id: 'identity' },
      expect.objectContaining({
        userId: 'user-1',
        responseId: 'res-1',
        currentSessionId: 'sess-new',
      }),
    );
  });

  it('answers 409 and names what is still owed when the steps are not complete', async () => {
    mocks.resolve.mockResolvedValue({
      status: 'outstanding',
      responseId: 'res-1',
      outstanding: ['fresh_authentication'],
      sessionsEnded: 0,
      supportPath: '/support',
    });

    const response = await patch();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      outstanding: ['fresh_authentication'],
    });
  });

  it('answers 404 for a response id that is not this account', async () => {
    mocks.resolve.mockResolvedValue({
      status: 'not_found',
      responseId: 'someone-elses',
      outstanding: ['fresh_authentication', 'other_sessions_ended'],
      sessionsEnded: 0,
      supportPath: '/support',
    });

    const response = await patch({ responseId: 'someone-elses' });

    expect(response.status).toBe(404);
  });

  it('refuses to close without a second factor, and never reaches the service', async () => {
    mocks.requireStepUp.mockRejectedValue(createError.forbidden('Confirm it is you.'));

    const response = await patch();

    expect(response.status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('refuses to close without a CSRF token, and never reaches step-up', async () => {
    mocks.requireCsrfToken.mockResolvedValue(
      NextResponse.json({ error: 'csrf' }, { status: 403 }) as never,
    );

    const response = await patch();

    expect(response.status).toBe(403);
    expect(mocks.requireStepUp).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('lets an account with no second factor close the hold, and records that it had none', async () => {
    mocks.hasEnrolledSecondFactor.mockResolvedValue(false);
    mocks.resolve.mockResolvedValue({
      status: 'resolved',
      responseId: 'res-1',
      outstanding: [],
      sessionsEnded: 1,
      supportPath: '/support',
    });

    const response = await patch();

    expect(response.status).toBe(200);
    expect(mocks.requireStepUp).not.toHaveBeenCalled();
    expect(mocks.resolve).toHaveBeenCalledWith(
      DB,
      { id: 'identity' },
      expect.objectContaining({ secondFactorVerified: false }),
    );
  });

  it('still demands the factor from an account that has one', async () => {
    mocks.requireStepUp.mockRejectedValue(createError.forbidden('Confirm it is you.'));

    const response = await patch();

    expect(response.status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('refuses a body that names no response', async () => {
    const response = await patch({});

    expect(response.status).toBe(400);
    expect(mocks.requireStepUp).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
