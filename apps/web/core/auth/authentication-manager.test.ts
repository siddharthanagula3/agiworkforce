import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from './authentication-manager';

// authService is now a Clerk adapter — login/register/password flows return
// stub errors pointing callers to the Clerk UI components.
// getCurrentUser() and updateProfile() delegate to fetch('/api/me').

// Mock logger
vi.mock('@shared/lib/logger', () => ({
  logger: {
    auth: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AuthService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('getCurrentUser', () => {
    it('should return user when authenticated', async () => {
      const mockData = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: undefined,
        plan: { tier: 'free' },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
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
      mockFetch.mockResolvedValue({ ok: false });

      const result = await authService.getCurrentUser();

      expect(result.user).toBeNull();
      expect(result.error).toBe('Not authenticated');
    });

    it('should handle fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await authService.getCurrentUser();

      expect(result.user).toBeNull();
      expect(result.error).toBe('Network error');
    });
  });

  describe('login', () => {
    it('should return Clerk stub error', async () => {
      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user).toBeNull();
      expect(result.error).toBe('Use Clerk sign-in flow');
    });
  });

  describe('register', () => {
    it('should return Clerk stub error', async () => {
      const result = await authService.register({
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      });

      expect(result.user).toBeNull();
      expect(result.error).toBe('Use Clerk sign-up flow');
    });
  });

  describe('logout', () => {
    it('should return no error (no-op in Clerk adapter)', async () => {
      const result = await authService.logout();

      expect(result.error).toBeNull();
    });
  });

  describe('resetPassword', () => {
    it('should return Clerk stub error', async () => {
      const result = await authService.resetPassword('test@example.com');

      expect(result.error).toBe('Use Clerk forgot-password flow');
    });
  });

  describe('updatePassword', () => {
    it('should return Clerk stub error', async () => {
      const result = await authService.updatePassword('newpassword123');

      expect(result.error).toBe('Use Clerk password management');
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully via fetch', async () => {
      const mockData = {
        id: '1',
        email: 'test@example.com',
        name: 'Updated Name',
        avatar_url: 'new-avatar.jpg',
        plan: { tier: 'pro' },
      };

      // PATCH call succeeds
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      // getCurrentUser() re-fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await authService.updateProfile({
        name: 'Updated Name',
        avatar: 'new-avatar.jpg',
      });

      expect(result.user?.name).toBe('Updated Name');
      expect(result.error).toBeNull();
    });

    it('should return error when PATCH fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await authService.updateProfile({ name: 'Fail' });

      expect(result.user).toBeNull();
      expect(result.error).toBe('Profile update failed');
    });
  });

  describe('changePassword', () => {
    it('should return Clerk stub error', async () => {
      const result = await authService.changePassword('oldpassword', 'newpassword');

      expect(result.error).toBe('Use Clerk password management');
    });
  });
});
