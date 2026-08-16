
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

const mockVerifyToken = vi.fn();
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

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
    mockAuth.mockResolvedValue({ userId: null });
    mockVerifyToken.mockResolvedValue({ sub: undefined });
  });

  test('HAPPY_PATH: valid Clerk session resolves the authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'session-user-1' });
    const result = await getClerkAuthUser(makeRequest());
    expect(result.userId).toBe('session-user-1');
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
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  test('SECURITY: token with empty subject claim is not accepted as a user', async () => {
    mockVerifyToken.mockResolvedValue({ sub: '' });
    await expect(getClerkAuthUser(makeRequest('Bearer empty.sub.token'))).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
