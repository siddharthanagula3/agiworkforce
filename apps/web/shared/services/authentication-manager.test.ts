import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from './authentication-manager';

vi.mock('@shared/lib/logger', () => ({
  logger: {
    auth: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function mePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    avatar_url: null,
    created_at: null,
    updated_at: 1751712000,
    plan: { tier: 'free', display_name: 'Free', status: 'none', current_period_end: null },
    feature_flags: { advanced_model_access: false },
    credits: null,
    routing_preferences: {},
    ...overrides,
  };
}

describe('AuthService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('getCurrentUser', () => {
    it('should return user when authenticated', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        clone() {
          return this;
        },
        json: () => Promise.resolve(mePayload()),
      });

      const result = await authService.getCurrentUser();

      expect(result.user).toEqual({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        avatar: undefined,
        role: 'user',
        plan: 'free',
      });
      expect(result.error).toBeNull();
    });

    it('should return error when not authenticated', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        clone() {
          return this;
        },
      });

      const result = await authService.getCurrentUser();

      expect(result.user).toBeNull();
      expect(result.error).toBe('Not authenticated');
      expect(result.transient).toBeUndefined();
    });

    it('marks a rate limit as transient rather than not authenticated', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        clone() {
          return this;
        },
      });

      const result = await authService.getCurrentUser();

      expect(result.user).toBeNull();
      expect(result.error).not.toBe('Not authenticated');
      expect(result.transient).toBe(true);
    });

    it('should handle fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await authService.getCurrentUser();

      expect(result.user).toBeNull();
      expect(result.error).toBe('Network error');
      expect(result.transient).toBe(true);
    });

    it('should return an error when the payload violates the /api/me contract', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        clone() {
          return this;
        },
        json: () => Promise.resolve({ id: '1', email: 'test@example.com' }),
      });

      const result = await authService.getCurrentUser();

      expect(result.user).toBeNull();
      expect(result.error).not.toBeNull();
    });
  });

  describe('logout', () => {
    it('should return no error (no-op in Clerk adapter)', async () => {
      const result = await authService.logout();

      expect(result.error).toBeNull();
    });
  });
});
