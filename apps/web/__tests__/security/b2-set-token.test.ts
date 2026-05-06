/**
 * B2: refresh-only set-token path was permanently broken.
 * I-1 / mix-and-match: refresh_token must be independently exchanged.
 *
 * Tests cover the contract that:
 *   - garbage / invalid access_token → 401
 *   - garbage / invalid refresh_token → 401 (refresh-only path)
 *   - valid refresh_token alone → 200 + cookie set (was broken before B2)
 *   - access_token of user A + refresh_token of user B → 401 (mix-and-match)
 *   - oversize tokens (>4 KiB) → 400 from zod
 *   - both empty → 400
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// Rate-limit mock — always pass through in tests.
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

// CSRF mock — let every request through; we test the body-validation path.
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

// Cookies mock — capture writes so we can assert which cookies were set.
const cookieWrites: Array<{ name: string; value: string }> = [];
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: (name: string, value: string) => {
      cookieWrites.push({ name, value });
    },
  })),
}));

// Supabase mock — drives access-token-validate and refresh-exchange behavior
// based on per-test config.
type MockedAccessUser = { id: string } | null;
type MockedRefreshUser = { id: string } | null;
const mockState = {
  accessTokenUser: null as MockedAccessUser,
  refreshTokenUser: null as MockedRefreshUser,
  refreshThrows: false,
};

const mockGetUser = vi.fn(async (token: string) => {
  if (mockState.accessTokenUser && token) {
    return { data: { user: mockState.accessTokenUser }, error: null };
  }
  return { data: { user: null }, error: new Error('invalid') };
});

const mockRefreshSession = vi.fn(async ({ refresh_token }: { refresh_token: string }) => {
  if (mockState.refreshThrows) {
    throw new Error('SDK error');
  }
  if (mockState.refreshTokenUser && refresh_token) {
    return {
      data: { session: { user: mockState.refreshTokenUser, access_token: 't', refresh_token } },
      error: null,
    };
  }
  return { data: { session: null }, error: new Error('invalid refresh') };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
    },
  })),
}));

process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/set-token/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/set-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'ok' },
    body: JSON.stringify(body),
  });
}

describe('B2: set-token route', () => {
  beforeEach(() => {
    cookieWrites.length = 0;
    mockState.accessTokenUser = null;
    mockState.refreshTokenUser = null;
    mockState.refreshThrows = false;
    mockGetUser.mockClear();
    mockRefreshSession.mockClear();
  });

  it('rejects empty body with 400', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(cookieWrites).toEqual([]);
  });

  it('rejects oversize access token with 400 (zod cap)', async () => {
    const huge = 'a'.repeat(5000);
    const res = await POST(makeRequest({ token: huge }));
    expect(res.status).toBe(400);
  });

  it('rejects oversize refresh token with 400 (zod cap)', async () => {
    const huge = 'b'.repeat(5000);
    const res = await POST(makeRequest({ refreshToken: huge }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid access token with 401', async () => {
    mockState.accessTokenUser = null; // getUser returns no user
    const res = await POST(makeRequest({ token: 'bogus-but-long-enough-token-1234' }));
    expect(res.status).toBe(401);
    expect(cookieWrites).toEqual([]);
  });

  it('B2 fix: refresh-only path with valid refresh_token sets cookie', async () => {
    mockState.refreshTokenUser = { id: 'user-A' };
    const res = await POST(makeRequest({ refreshToken: 'valid-refresh-token-1234567890' }));
    expect(res.status).toBe(200);
    expect(mockRefreshSession).toHaveBeenCalledWith({
      refresh_token: 'valid-refresh-token-1234567890',
    });
    // setSession was NOT called (we use refreshSession exclusively now)
    const refreshCookie = cookieWrites.find((c) => c.name === 'agi_refresh_token');
    expect(refreshCookie?.value).toBe('valid-refresh-token-1234567890');
  });

  it('refresh-only path with invalid refresh_token returns 401', async () => {
    mockState.refreshTokenUser = null;
    const res = await POST(makeRequest({ refreshToken: 'forged-refresh-token-1234567890' }));
    expect(res.status).toBe(401);
    expect(cookieWrites).toEqual([]);
  });

  it('refresh-only path with throwing SDK returns 401 (not 500)', async () => {
    mockState.refreshThrows = true;
    mockState.refreshTokenUser = { id: 'user-A' };
    const res = await POST(makeRequest({ refreshToken: 'token-that-causes-throw-12345' }));
    expect(res.status).toBe(401);
    expect(cookieWrites).toEqual([]);
  });

  it('I-1 fix: mix-and-match (access user A + refresh user B) returns 401', async () => {
    mockState.accessTokenUser = { id: 'user-A' };
    mockState.refreshTokenUser = { id: 'user-B' }; // different user
    const res = await POST(
      makeRequest({
        token: 'access-token-for-user-a-12345',
        refreshToken: 'refresh-token-for-user-b-12345',
      }),
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('mismatch');
    expect(cookieWrites).toEqual([]);
  });

  it('matching access + refresh for same user sets BOTH cookies', async () => {
    mockState.accessTokenUser = { id: 'user-A' };
    mockState.refreshTokenUser = { id: 'user-A' };
    const res = await POST(
      makeRequest({
        token: 'access-token-1234567890abcdef',
        refreshToken: 'refresh-token-1234567890abcdef',
      }),
    );
    expect(res.status).toBe(200);
    const accessCookie = cookieWrites.find((c) => c.name === 'agi_access_token');
    const refreshCookie = cookieWrites.find((c) => c.name === 'agi_refresh_token');
    expect(accessCookie?.value).toBe('access-token-1234567890abcdef');
    expect(refreshCookie?.value).toBe('refresh-token-1234567890abcdef');
  });

  it('access-only path (no refresh) sets only access cookie', async () => {
    mockState.accessTokenUser = { id: 'user-A' };
    const res = await POST(makeRequest({ token: 'access-token-1234567890abcdef' }));
    expect(res.status).toBe(200);
    const accessCookie = cookieWrites.find((c) => c.name === 'agi_access_token');
    expect(accessCookie?.value).toBe('access-token-1234567890abcdef');
    const refreshCookie = cookieWrites.find((c) => c.name === 'agi_refresh_token');
    expect(refreshCookie).toBeUndefined();
    // refreshSession is NOT called when no refresh_token in payload
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('I-1 fix: refreshSession is called even when access_token is also valid', async () => {
    // The whole point of the fix: refresh_token is independently exchanged
    // against Supabase rather than trusted via setSession's access-only path.
    mockState.accessTokenUser = { id: 'user-A' };
    mockState.refreshTokenUser = { id: 'user-A' };
    await POST(
      makeRequest({
        token: 'access-token-1234567890abcdef',
        refreshToken: 'refresh-token-1234567890abcdef',
      }),
    );
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockRefreshSession).toHaveBeenCalledWith({
      refresh_token: 'refresh-token-1234567890abcdef',
    });
  });
});
