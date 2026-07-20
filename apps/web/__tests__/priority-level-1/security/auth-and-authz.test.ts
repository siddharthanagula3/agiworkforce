/**
 * L1 Security - Authentication & Authorization
 *
 * Exercises the REAL request authenticator:
 *   apps/web/lib/api-auth.ts (getClerkAuthUser)
 *
 * Two trust paths are validated against shipping logic:
 *   1. Clerk session cookie (browser via middleware) → auth()
 *   2. Bearer token (desktop/CLI/mobile) → verifyToken(@clerk/backend)
 *
 * A request with neither a session nor a valid Bearer token must be rejected
 * with a 401-shaped error — never silently treated as authenticated.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

// ─── Clerk session mock (Path 1) ────────────────────────────────────────────
const mockAuth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

// ─── Clerk Bearer verification mock (Path 2) ────────────────────────────────
const mockVerifyToken = vi.fn();
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

// assertAccountActive (inside getClerkAuthUser) reads profiles.account_status and
// now fails CLOSED on a lookup error. Provide an active row so the happy-path
// auth tests exercise identity resolution, not the fail-closed branch.
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: vi.fn().mockResolvedValue([{ account_status: 'active' }]),
  }),
}));

import { getClerkAuthUser } from '@/lib/api-auth';

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/whatever', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('L1 Security - Auth & Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['CLERK_SECRET_KEY'] = 'sk_test_clerk';
    // Default: no session, no valid token.
    mockAuth.mockResolvedValue({ userId: null });
    mockVerifyToken.mockResolvedValue({ sub: undefined });
  });

  test('HAPPY_PATH: valid Clerk session resolves the authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'session-user-1' });
    const result = await getClerkAuthUser(makeRequest());
    expect(result.userId).toBe('session-user-1');
    // Session path short-circuits — Bearer verification is never consulted.
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  test('HAPPY_PATH: valid Bearer token resolves the authenticated user', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'bearer-user-2', email: 'b@example.com' });
    const result = await getClerkAuthUser(makeRequest('Bearer valid.jwt.token'));
    expect(result.userId).toBe('bearer-user-2');
    expect(result.email).toBe('b@example.com');
    expect(mockVerifyToken).toHaveBeenCalledWith('valid.jwt.token', {
      secretKey: 'sk_test_clerk',
    });
  });

  test('SECURITY: expired/invalid Bearer token is rejected (401), not honored', async () => {
    mockVerifyToken.mockRejectedValue(new Error('token expired'));
    await expect(getClerkAuthUser(makeRequest('Bearer expired.jwt.token'))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test('SECURITY: no session and no Authorization header → 401 (no implicit access)', async () => {
    await expect(getClerkAuthUser(makeRequest())).rejects.toMatchObject({ statusCode: 401 });
  });

  test('SECURITY: malformed Authorization header (no Bearer prefix) → 401', async () => {
    await expect(getClerkAuthUser(makeRequest('Basic abc123'))).rejects.toMatchObject({
      statusCode: 401,
    });
    // A non-Bearer scheme must not be passed to token verification.
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  test('SECURITY: token with empty subject claim is not accepted as a user', async () => {
    mockVerifyToken.mockResolvedValue({ sub: '' });
    await expect(getClerkAuthUser(makeRequest('Bearer empty.sub.token'))).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
