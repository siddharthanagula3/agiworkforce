import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { mockAuth, mockGetClerkAuthUser, mockVerifyToken, mockGetUserScopedDb } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));

import { resolveSessionsPrincipal } from '@/app/api/settings/sessions/session-principal';

const DEPLOYMENT_ORIGIN = 'https://app.agiworkforce.test';
const BEARER = 'clerk.session.jwt';

function bearerRequest(): NextRequest {
  return {
    headers: new Headers({ authorization: `Bearer ${BEARER}` }),
  } as unknown as NextRequest;
}

describe('resolveSessionsPrincipal binds Clerk bearer verification to an authorized party', () => {
  const savedAppUrl = process.env['NEXT_PUBLIC_APP_URL'];
  const savedParties = process.env['CLERK_AUTHORIZED_PARTIES'];
  const savedSecret = process.env['CLERK_SECRET_KEY'];

  beforeEach(() => {
    mockAuth.mockReset();
    mockGetClerkAuthUser.mockReset();
    mockVerifyToken.mockReset();
    mockGetUserScopedDb.mockReset();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_sessions_1' });
    mockGetUserScopedDb.mockResolvedValue({
      db: {} as never,
      userId: 'user_sessions_1',
      organizationId: null,
    });
    mockVerifyToken.mockResolvedValue({ sub: 'user_sessions_1', sid: 'sess_abc' });
    delete process.env['CLERK_AUTHORIZED_PARTIES'];
    process.env['NEXT_PUBLIC_APP_URL'] = DEPLOYMENT_ORIGIN;
    process.env['CLERK_SECRET_KEY'] = 'sk_test_sessions';
  });

  afterEach(() => {
    if (savedAppUrl === undefined) delete process.env['NEXT_PUBLIC_APP_URL'];
    else process.env['NEXT_PUBLIC_APP_URL'] = savedAppUrl;
    if (savedParties === undefined) delete process.env['CLERK_AUTHORIZED_PARTIES'];
    else process.env['CLERK_AUTHORIZED_PARTIES'] = savedParties;
    if (savedSecret === undefined) delete process.env['CLERK_SECRET_KEY'];
    else process.env['CLERK_SECRET_KEY'] = savedSecret;
  });

  it('falls back to the deployment origin when CLERK_AUTHORIZED_PARTIES is unset', async () => {
    const principal = await resolveSessionsPrincipal(bearerRequest());

    expect(principal).toMatchObject({ userId: 'user_sessions_1', currentSessionId: 'sess_abc' });
    expect(mockVerifyToken).toHaveBeenCalledWith(BEARER, {
      secretKey: 'sk_test_sessions',
      authorizedParties: [DEPLOYMENT_ORIGIN],
    });
  });

  it('uses the configured allowlist when CLERK_AUTHORIZED_PARTIES is set', async () => {
    process.env['CLERK_AUTHORIZED_PARTIES'] = 'https://app.example.com, https://admin.example.com';

    await resolveSessionsPrincipal(bearerRequest());

    expect(mockVerifyToken).toHaveBeenCalledWith(BEARER, {
      secretKey: 'sk_test_sessions',
      authorizedParties: ['https://app.example.com', 'https://admin.example.com'],
    });
  });

  it('never verifies the token when no authorized party can be resolved', async () => {
    delete process.env['NEXT_PUBLIC_APP_URL'];

    const principal = await resolveSessionsPrincipal(bearerRequest());

    expect(mockVerifyToken).not.toHaveBeenCalled();
    expect(principal).toMatchObject({ userId: 'user_sessions_1', currentSessionId: null });
  });
});
