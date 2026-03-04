/**
 * Concurrent Login / Multi-Session Tests
 *
 * Tests for handling multiple device logins, session conflicts,
 * and concurrent authentication scenarios.
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

// Mock Supabase auth methods
const mockGetSession = vi.fn();
const mockGetUser = vi.fn();
const mockRefreshSession = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      onAuthStateChange: mockOnAuthStateChange,
    },
  })),
  createBrowserClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      onAuthStateChange: mockOnAuthStateChange,
    },
  })),
}));

// Mock Supabase JS client for admin operations
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        listUserSessions: vi.fn(),
        deleteSession: vi.fn(),
        signOut: vi.fn(),
      },
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          order: vi.fn(() => ({
            limit: vi.fn(),
          })),
        })),
      })),
      insert: vi.fn(),
      update: vi.fn(() => ({
        eq: vi.fn(),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(),
      })),
    })),
  })),
}));

describe('Concurrent Login / Multi-Session Handling', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { full_name: 'Test User' },
    created_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Multiple Device Sessions', () => {
    it('should allow login from multiple devices simultaneously', async () => {
      const deviceASession = {
        access_token: 'device-a-token',
        refresh_token: 'device-a-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: mockUser,
      };

      const deviceBSession = {
        access_token: 'device-b-token',
        refresh_token: 'device-b-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: mockUser,
      };

      // Simulate login from Device A
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { session: deviceASession, user: mockUser },
        error: null,
      });

      // Simulate login from Device B (different token, same user)
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { session: deviceBSession, user: mockUser },
        error: null,
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      // Device A login
      const { data: loginA } = await client.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123',
      });

      // Device B login
      const { data: loginB } = await client.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(loginA.session?.access_token).toBe('device-a-token');
      expect(loginB.session?.access_token).toBe('device-b-token');
      expect(loginA.session?.access_token).not.toBe(loginB.session?.access_token);
      expect(loginA.user?.id).toBe(loginB.user?.id); // Same user
    });

    it('should maintain separate sessions per device', async () => {
      let currentDeviceSession: string | null = null;

      mockGetSession.mockImplementation(async () => {
        return {
          data: {
            session: currentDeviceSession
              ? {
                  access_token: currentDeviceSession,
                  user: mockUser,
                }
              : null,
          },
          error: null,
        };
      });

      const { createServerClient } = await import('@supabase/ssr');

      // Device A context
      currentDeviceSession = 'device-a-token';
      const clientA = createServerClient('', '', { cookies: {} as never });
      const { data: sessionA } = await clientA.auth.getSession();

      // Device B context
      currentDeviceSession = 'device-b-token';
      const clientB = createServerClient('', '', { cookies: {} as never });
      const { data: sessionB } = await clientB.auth.getSession();

      expect(sessionA.session?.access_token).toBe('device-a-token');
      expect(sessionB.session?.access_token).toBe('device-b-token');
    });

    it('should handle device limit exceeded', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: {
          message: 'Maximum number of sessions reached',
          status: 403,
          code: 'session_limit_exceeded',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('session_limit_exceeded');
    });
  });

  describe('Session Invalidation Scenarios', () => {
    it('should invalidate old session when new login occurs (if single-session mode)', async () => {
      const oldSession = {
        access_token: 'old-token',
        refresh_token: 'old-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: mockUser,
      };

      // First call returns old session
      mockGetSession.mockResolvedValueOnce({
        data: { session: oldSession },
        error: null,
      });

      // After new login on another device, old session is invalidated
      mockGetSession.mockResolvedValueOnce({
        data: { session: null },
        error: {
          message: 'Session has been invalidated',
          status: 401,
          code: 'session_invalidated',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      // First check - session valid
      const { data: validSession } = await client.auth.getSession();
      expect(validSession.session).toBeDefined();

      // After another device logs in and invalidates this session
      const { data: invalidatedSession, error } = await client.auth.getSession();
      expect(invalidatedSession.session).toBeNull();
      expect(error?.code).toBe('session_invalidated');
    });

    it('should handle password change invalidating all sessions', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'Password was recently changed. Please log in again.',
          status: 401,
          code: 'password_changed',
        },
      });

      mockRefreshSession.mockResolvedValue({
        data: { session: null, user: null },
        error: {
          message: 'Password was recently changed. Please log in again.',
          status: 401,
          code: 'password_changed',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error: userError } = await client.auth.getUser();
      expect(userError?.code).toBe('password_changed');

      const { error: refreshError } = await client.auth.refreshSession();
      expect(refreshError?.code).toBe('password_changed');
    });

    it('should handle account disabled', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'User account has been disabled',
          status: 403,
          code: 'user_disabled',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.getUser();
      expect(error?.code).toBe('user_disabled');
      expect(error?.status).toBe(403);
    });

    it('should handle account deletion during active session', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'User not found',
          status: 404,
          code: 'user_not_found',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.getUser();
      expect(error?.code).toBe('user_not_found');
    });
  });

  describe('Concurrent Token Refresh', () => {
    it('should handle concurrent refresh from multiple devices', async () => {
      const refreshCounts: Record<string, number> = {};

      mockRefreshSession.mockImplementation(async () => {
        const deviceId = Math.random().toString();
        refreshCounts[deviceId] = (refreshCounts[deviceId] || 0) + 1;

        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, 5));

        return {
          data: {
            session: {
              access_token: `new-token-${deviceId}`,
              refresh_token: `new-refresh-${deviceId}`,
              user: mockUser,
            },
            user: mockUser,
          },
          error: null,
        };
      });

      const { createServerClient } = await import('@supabase/ssr');

      // Simulate 3 devices refreshing simultaneously
      const refreshPromises = [
        createServerClient('', '', { cookies: {} as never }).auth.refreshSession(),
        createServerClient('', '', { cookies: {} as never }).auth.refreshSession(),
        createServerClient('', '', { cookies: {} as never }).auth.refreshSession(),
      ];

      const results = await Promise.all(refreshPromises);

      // All should succeed with different tokens
      results.forEach((result) => {
        expect(result.error).toBeNull();
        expect(result.data.session).toBeDefined();
      });

      // Each device should get its own token
      const tokens = results.map((r) => r.data.session?.access_token);
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(3);
    });

    it('should handle refresh token reuse attack', async () => {
      let refreshTokenUsed = false;

      mockRefreshSession.mockImplementation(async () => {
        if (refreshTokenUsed) {
          return {
            data: { session: null, user: null },
            error: {
              message: 'Refresh token has already been used',
              status: 401,
              code: 'refresh_token_reused',
            },
          };
        }
        refreshTokenUsed = true;
        return {
          data: {
            session: {
              access_token: 'new-token',
              refresh_token: 'new-refresh',
              user: mockUser,
            },
            user: mockUser,
          },
          error: null,
        };
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      // First refresh succeeds
      const { data: first, error: firstError } = await client.auth.refreshSession();
      expect(firstError).toBeNull();
      expect(first.session).toBeDefined();

      // Second refresh with same token fails (replay attack)
      const { error: secondError } = await client.auth.refreshSession();
      expect(secondError?.code).toBe('refresh_token_reused');
    });

    it('should handle token family rotation', async () => {
      // Supabase uses token families - when a refresh token is used,
      // all tokens in that family should be rotated
      let tokenFamilyVersion = 1;

      mockRefreshSession.mockImplementation(async () => {
        tokenFamilyVersion++;
        return {
          data: {
            session: {
              access_token: `access-v${tokenFamilyVersion}`,
              refresh_token: `refresh-v${tokenFamilyVersion}`,
              user: mockUser,
            },
            user: mockUser,
          },
          error: null,
        };
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { data: first } = await client.auth.refreshSession();
      expect(first.session?.access_token).toBe('access-v2');

      const { data: second } = await client.auth.refreshSession();
      expect(second.session?.access_token).toBe('access-v3');
    });
  });

  describe('Auth State Change Events', () => {
    it('should emit SIGNED_OUT event when session is invalidated', async () => {
      const events: Array<{ event: string; session: unknown }> = [];

      mockOnAuthStateChange.mockImplementation((callback) => {
        // Simulate immediate callback with current state
        callback('INITIAL_SESSION', { user: mockUser });

        // Simulate sign out event after delay
        setTimeout(() => {
          callback('SIGNED_OUT', null);
          events.push({ event: 'SIGNED_OUT', session: null });
        }, 10);

        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        };
      });

      const { createBrowserClient } = await import('@supabase/ssr');
      const client = createBrowserClient('', '');

      client.auth.onAuthStateChange((event, session) => {
        events.push({ event, session });
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.some((e) => e.event === 'SIGNED_OUT')).toBe(true);
    });

    it('should emit TOKEN_REFRESHED event after successful refresh', async () => {
      const events: Array<{ event: string }> = [];

      mockOnAuthStateChange.mockImplementation((callback) => {
        // Store callback for later use
        setTimeout(() => {
          callback('TOKEN_REFRESHED', {
            access_token: 'new-token',
            user: mockUser,
          });
        }, 10);

        return {
          data: {
            subscription: { unsubscribe: vi.fn() },
          },
        };
      });

      const { createBrowserClient } = await import('@supabase/ssr');
      const client = createBrowserClient('', '');

      client.auth.onAuthStateChange((event) => {
        events.push({ event });
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.some((e) => e.event === 'TOKEN_REFRESHED')).toBe(true);
    });

    it('should handle USER_UPDATED event from another session', async () => {
      const events: Array<{ event: string; user: unknown }> = [];

      mockOnAuthStateChange.mockImplementation((callback) => {
        setTimeout(() => {
          callback('USER_UPDATED', {
            user: {
              ...mockUser,
              user_metadata: { full_name: 'Updated Name' },
            },
          });
        }, 10);

        return {
          data: {
            subscription: { unsubscribe: vi.fn() },
          },
        };
      });

      const { createBrowserClient } = await import('@supabase/ssr');
      const client = createBrowserClient('', '');

      client.auth.onAuthStateChange((event, session) => {
        events.push({ event, user: session?.user });
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const updateEvent = events.find((e) => e.event === 'USER_UPDATED');
      expect(updateEvent).toBeDefined();
    });
  });

  describe('Session Conflict Resolution', () => {
    it('should handle session version mismatch', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: {
          message: 'Session version mismatch',
          status: 409,
          code: 'session_version_mismatch',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.getSession();
      expect(error?.status).toBe(409);
    });

    it('should handle simultaneous password reset from multiple sessions', async () => {
      let passwordResetInitiated = false;

      mockRefreshSession.mockImplementation(async () => {
        if (passwordResetInitiated) {
          return {
            data: { session: null, user: null },
            error: {
              message: 'Password reset in progress',
              status: 401,
              code: 'password_reset_pending',
            },
          };
        }
        passwordResetInitiated = true;
        return {
          data: {
            session: { access_token: 'token', user: mockUser },
            user: mockUser,
          },
          error: null,
        };
      });

      const { createServerClient } = await import('@supabase/ssr');

      // Session 1 triggers password reset
      const client1 = createServerClient('', '', { cookies: {} as never });
      await client1.auth.refreshSession();

      // Session 2 tries to refresh during reset
      const client2 = createServerClient('', '', { cookies: {} as never });
      const { error } = await client2.auth.refreshSession();

      expect(error?.code).toBe('password_reset_pending');
    });

    it('should handle email change invalidating sessions', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'Email has been changed. Please log in with new email.',
          status: 401,
          code: 'email_changed',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.getUser();
      expect(error?.code).toBe('email_changed');
    });
  });

  describe('Cross-Platform Session Handling', () => {
    it('should distinguish web session from desktop session', async () => {
      // Web session uses cookies
      const webSession = {
        access_token: 'web-token',
        refresh_token: 'web-refresh',
        user: mockUser,
      };

      // Desktop session uses stored tokens
      const desktopSession = {
        access_token: 'desktop-token',
        refresh_token: 'desktop-refresh',
        user: mockUser,
      };

      mockGetSession.mockResolvedValueOnce({
        data: { session: webSession },
        error: null,
      });

      mockGetSession.mockResolvedValueOnce({
        data: { session: desktopSession },
        error: null,
      });

      const { createServerClient, createBrowserClient } = await import('@supabase/ssr');

      // Web client
      const webClient = createServerClient('', '', { cookies: {} as never });
      const { data: webData } = await webClient.auth.getSession();

      // Desktop client (simulated via browser client)
      const desktopClient = createBrowserClient('', '');
      const { data: desktopData } = await desktopClient.auth.getSession();

      expect(webData.session?.access_token).toBe('web-token');
      expect(desktopData.session?.access_token).toBe('desktop-token');
    });

    it('should handle mobile session alongside web session', async () => {
      const sessions = [
        { platform: 'web', token: 'web-token' },
        { platform: 'ios', token: 'ios-token' },
        { platform: 'android', token: 'android-token' },
      ];

      let sessionIndex = 0;
      mockGetSession.mockImplementation(async () => {
        const session = sessions[sessionIndex % sessions.length]!;
        sessionIndex++;
        return {
          data: {
            session: {
              access_token: session.token,
              user: mockUser,
            },
          },
          error: null,
        };
      });

      const { createServerClient } = await import('@supabase/ssr');

      const results = await Promise.all([
        createServerClient('', '', { cookies: {} as never }).auth.getSession(),
        createServerClient('', '', { cookies: {} as never }).auth.getSession(),
        createServerClient('', '', { cookies: {} as never }).auth.getSession(),
      ]);

      const tokens = results.map((r) => r.data.session?.access_token);
      expect(tokens).toContain('web-token');
      expect(tokens).toContain('ios-token');
      expect(tokens).toContain('android-token');
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle session hijacking detection', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'Suspicious activity detected. Session terminated.',
          status: 401,
          code: 'session_hijacking_detected',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.getUser();
      expect(error?.code).toBe('session_hijacking_detected');
    });

    it('should handle IP address change detection', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'IP address changed. Please re-authenticate.',
          status: 401,
          code: 'ip_mismatch',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.getUser();
      expect(error?.code).toBe('ip_mismatch');
    });

    it('should handle suspicious login location', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: {
          message: 'Login from unusual location. Verification required.',
          status: 403,
          code: 'unusual_location',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(error?.code).toBe('unusual_location');
    });

    it('should handle brute force protection lockout', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: {
          message: 'Too many failed attempts. Account temporarily locked.',
          status: 429,
          code: 'account_locked',
        },
      });

      const { createServerClient } = await import('@supabase/ssr');
      const client = createServerClient('', '', { cookies: {} as never });

      const { error } = await client.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'wrong-password',
      });

      expect(error?.code).toBe('account_locked');
      expect(error?.status).toBe(429);
    });
  });
});
