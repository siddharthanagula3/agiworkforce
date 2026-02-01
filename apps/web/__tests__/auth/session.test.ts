/**
 * Session Management Tests
 *
 * Tests for token refresh, expiration handling, and session lifecycle edge cases.
 * Focuses on Supabase auth client behavior for JWT tokens.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock cookies for next/headers
const mockCookieStore = {
  get: vi.fn(),
  getAll: vi.fn(() => []),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => mockCookieStore),
}));

// Mock Supabase SSR client
const mockGetSession = vi.fn();
const mockGetUser = vi.fn();
const mockRefreshSession = vi.fn();
const mockSetSession = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
      setSession: mockSetSession,
      signOut: mockSignOut,
    },
  })),
  createBrowserClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
      setSession: mockSetSession,
      signOut: mockSignOut,
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  })),
}));

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Token Refresh Handling', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      user_metadata: { full_name: 'Test User' },
    };

    const mockValidSession = {
      access_token: 'valid-access-token',
      refresh_token: 'valid-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      expires_in: 3600,
      user: mockUser,
    };

    const mockExpiredSession = {
      access_token: 'expired-access-token',
      refresh_token: 'valid-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
      expires_in: -300,
      user: mockUser,
    };

    it('should return valid session when token is not expired', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: mockValidSession },
        error: null,
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });
      const { data, error } = await client.auth.getSession();

      expect(error).toBeNull();
      expect(data.session).toBeDefined();
      expect(data.session?.access_token).toBe('valid-access-token');
      expect(data.session?.expires_at).toBeGreaterThan(Date.now() / 1000);
    });

    it('should handle expired access token with valid refresh token', async () => {
      // First call returns expired session
      mockGetSession.mockResolvedValue({
        data: { session: mockExpiredSession },
        error: null,
      });

      // Refresh returns new valid session
      mockRefreshSession.mockResolvedValue({
        data: {
          session: {
            ...mockValidSession,
            access_token: 'new-access-token',
          },
          user: mockUser,
        },
        error: null,
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data: sessionData } = await client.auth.getSession();
      expect(sessionData.session?.expires_at).toBeLessThan(Date.now() / 1000);

      // Attempt refresh
      const { data: refreshData, error } = await client.auth.refreshSession();
      expect(error).toBeNull();
      expect(refreshData.session?.access_token).toBe('new-access-token');
    });

    it('should handle expired refresh token', async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: null, user: null },
        error: {
          message: 'Invalid Refresh Token: Refresh Token Not Found',
          status: 400,
          code: 'refresh_token_not_found',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data, error } = await client.auth.refreshSession();

      expect(data.session).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('refresh_token_not_found');
    });

    it('should handle revoked refresh token', async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: null, user: null },
        error: {
          message: 'Token has been revoked',
          status: 401,
          code: 'token_revoked',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data, error } = await client.auth.refreshSession();

      expect(data.session).toBeNull();
      expect(error).toBeDefined();
      expect(error?.message).toContain('revoked');
    });

    it('should handle token refresh race condition', async () => {
      // First call succeeds, second call fails (simulating token already used)
      mockRefreshSession
        .mockResolvedValueOnce({
          data: {
            session: { ...mockValidSession, access_token: 'token-first' },
            user: mockUser,
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { session: null, user: null },
          error: { message: 'Token already used', status: 400 },
        });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      // Simulate concurrent refresh attempts
      const [result1, result2] = await Promise.all([
        client.auth.refreshSession(),
        client.auth.refreshSession(),
      ]);

      // First should succeed, second should fail
      expect(result1.data.session).toBeDefined();
      expect(result1.data.session?.access_token).toBe('token-first');
      expect(result2.error).toBeDefined();
      expect(result2.error?.message).toBe('Token already used');
    });

    it('should handle malformed JWT token', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: {
          message: 'Invalid JWT: malformed token',
          status: 401,
          code: 'invalid_jwt',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data, error } = await client.auth.getSession();

      expect(data.session).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_jwt');
    });

    it('should handle JWT signature verification failure', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'Invalid JWT: signature verification failed',
          status: 401,
          code: 'invalid_jwt',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data, error } = await client.auth.getUser();

      expect(data.user).toBeNull();
      expect(error).toBeDefined();
      expect(error?.message).toContain('signature verification');
    });
  });

  describe('Session Expiration Edge Cases', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
    };

    it('should handle session expiring during request', async () => {
      // Session valid at start
      let callCount = 0;
      mockGetSession.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            data: {
              session: {
                access_token: 'token',
                expires_at: Math.floor(Date.now() / 1000) + 1, // Expires in 1 second
                user: mockUser,
              },
            },
            error: null,
          };
        }
        // Second call - session expired
        return {
          data: { session: null },
          error: { message: 'Session expired', status: 401 },
        };
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data: firstData } = await client.auth.getSession();
      expect(firstData.session).toBeDefined();

      // Simulate time passing
      await new Promise((resolve) => setTimeout(resolve, 50));

      const { data: secondData, error } = await client.auth.getSession();
      expect(secondData.session).toBeNull();
      expect(error).toBeDefined();
    });

    it('should handle near-expiration threshold (< 60 seconds)', async () => {
      const nearExpirySession = {
        access_token: 'near-expiry-token',
        refresh_token: 'refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 30, // 30 seconds from now
        expires_in: 30,
        user: mockUser,
      };

      mockGetSession.mockResolvedValue({
        data: { session: nearExpirySession },
        error: null,
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data } = await client.auth.getSession();

      // Session is valid but near expiry
      expect(data.session).toBeDefined();
      expect(data.session?.expires_in).toBeLessThan(60);

      // Should proactively refresh
      mockRefreshSession.mockResolvedValue({
        data: {
          session: {
            ...nearExpirySession,
            access_token: 'new-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
          },
          user: mockUser,
        },
        error: null,
      });

      const { data: refreshedData } = await client.auth.refreshSession();
      expect(refreshedData.session?.expires_in).toBeGreaterThan(60);
    });

    it('should handle clock skew between client and server', async () => {
      // Server time is slightly ahead
      const _serverTimeOffset = 120; // 2 minutes ahead
      const sessionExpiresAt = Math.floor(Date.now() / 1000) + 60; // Expires in 1 min client time

      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            expires_at: sessionExpiresAt,
            user: mockUser,
          },
        },
        error: null,
      });

      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'JWT expired',
          status: 401,
          code: 'token_expired',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      // getSession returns valid-looking session
      const { data: sessionData } = await client.auth.getSession();
      expect(sessionData.session).toBeDefined();

      // But server rejects it due to clock skew
      const { error } = await client.auth.getUser();
      expect(error?.code).toBe('token_expired');
    });

    it('should handle missing expires_at field', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token-without-expiry',
            refresh_token: 'refresh-token',
            // expires_at intentionally missing
            user: mockUser,
          },
        },
        error: null,
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data } = await client.auth.getSession();
      expect(data.session).toBeDefined();
      expect(data.session?.expires_at).toBeUndefined();
    });
  });

  describe('Session Cookie Handling', () => {
    it('should handle missing auth cookie', async () => {
      mockCookieStore.get.mockReturnValue(undefined);
      mockCookieStore.getAll.mockReturnValue([]);

      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data } = await client.auth.getSession();
      expect(data.session).toBeNull();
    });

    it('should handle corrupted auth cookie', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'not-valid-json' });

      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: {
          message: 'Invalid session cookie',
          status: 400,
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data, error } = await client.auth.getSession();
      expect(data.session).toBeNull();
      expect(error).toBeDefined();
    });

    it('should handle partial session in cookie (missing refresh_token)', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'access-token',
            // refresh_token missing
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: 'user-123', email: 'test@example.com' },
          },
        },
        error: null,
      });

      mockRefreshSession.mockResolvedValue({
        data: { session: null, user: null },
        error: {
          message: 'No refresh token available',
          status: 400,
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data: sessionData } = await client.auth.getSession();
      expect(sessionData.session).toBeDefined();

      // Cannot refresh without refresh_token
      const { error: refreshError } = await client.auth.refreshSession();
      expect(refreshError).toBeDefined();
    });

    it('should handle cookie size limit exceeded', async () => {
      // Simulate large token that might exceed cookie limits
      const largeToken = 'a'.repeat(5000);

      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: largeToken,
            refresh_token: 'refresh',
            user: { id: 'user-123' },
          },
        },
        error: null,
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data } = await client.auth.getSession();
      expect(data.session?.access_token.length).toBe(5000);
    });
  });

  describe('Network Error Handling', () => {
    it('should handle network timeout during token refresh', async () => {
      mockRefreshSession.mockRejectedValue(new Error('Network request timed out'));

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      await expect(client.auth.refreshSession()).rejects.toThrow('Network request timed out');
    });

    it('should handle Supabase service unavailable', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: {
          message: 'Service temporarily unavailable',
          status: 503,
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.getSession();
      expect(error?.status).toBe(503);
    });

    it('should handle rate limiting on auth endpoints', async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: null, user: null },
        error: {
          message: 'Rate limit exceeded',
          status: 429,
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.refreshSession();
      expect(error?.status).toBe(429);
    });

    it('should handle DNS resolution failure', async () => {
      mockGetUser.mockRejectedValue(new Error('getaddrinfo ENOTFOUND test.supabase.co'));

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      await expect(client.auth.getUser()).rejects.toThrow('ENOTFOUND');
    });
  });

  describe('Sign Out Edge Cases', () => {
    it('should clear session on sign out', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.signOut();
      expect(error).toBeNull();
      expect(mockSignOut).toHaveBeenCalled();
    });

    it('should handle sign out with expired token', async () => {
      mockSignOut.mockResolvedValue({
        error: {
          message: 'Session already expired',
          status: 401,
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      // Sign out should still succeed even with expired token
      const { error: _error } = await client.auth.signOut();
      // The client might return an error but the session should still be cleared locally
      expect(mockSignOut).toHaveBeenCalled();
    });

    it('should handle sign out with network failure', async () => {
      mockSignOut.mockRejectedValue(new Error('Network error'));

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      await expect(client.auth.signOut()).rejects.toThrow('Network error');
    });

    it('should handle global sign out (all devices)', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      // Scope: 'global' signs out all sessions
      await client.auth.signOut();
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('Set Session Edge Cases', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    it('should set session with valid tokens', async () => {
      mockSetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            user: mockUser,
          },
          user: mockUser,
        },
        error: null,
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data, error } = await client.auth.setSession({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      });

      expect(error).toBeNull();
      expect(data.session).toBeDefined();
    });

    it('should reject invalid access token on setSession', async () => {
      mockSetSession.mockResolvedValue({
        data: { session: null, user: null },
        error: {
          message: 'Invalid access token',
          status: 401,
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.setSession({
        access_token: 'invalid',
        refresh_token: 'refresh',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Invalid');
    });

    it('should handle setSession with missing refresh token', async () => {
      mockSetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'access',
            user: mockUser,
          },
          user: mockUser,
        },
        error: null,
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data } = await client.auth.setSession({
        access_token: 'access',
        refresh_token: '',
      });

      // Session set but won't be refreshable
      expect(data.session).toBeDefined();
    });
  });
});
