/**
 * Auth Service Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuthService, UserRole } from '../auth';
import { invoke } from '@tauri-apps/api/core';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Reset mocks
    vi.clearAllMocks();

    // Get fresh instance
    authService = AuthService.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create a singleton instance', () => {
      const instance1 = AuthService.getInstance();
      const instance2 = AuthService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should not be authenticated initially', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should return null for access token when not authenticated', () => {
      expect(authService.getAccessToken()).toBeNull();
    });
  });

  describe('Registration', () => {
    it('should register a new user', async () => {
      const userId = 'user-123';
      vi.mocked(invoke).mockResolvedValue(userId);

      const result = await authService.register('test@example.com', 'password123', UserRole.Editor);

      expect(result).toBe(userId);
      expect(invoke).toHaveBeenCalledWith('auth_register', {
        email: 'test@example.com',
        password: 'password123',
        role: UserRole.Editor,
      });
    });

    it('should throw error on registration failure', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Registration failed'));

      await expect(authService.register('test@example.com', 'password123')).rejects.toThrow(
        'Registration failed',
      );
    });
  });

  describe('Login', () => {
    it('should login successfully', async () => {
      const token = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      vi.mocked(invoke).mockResolvedValue(token);

      const result = await authService.login('test@example.com', 'password123');

      expect(result).toEqual(token);
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.getAccessToken()).toBe('test-access-token');
      expect(invoke).toHaveBeenCalledWith('auth_login', {
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should save token to localStorage on login', async () => {
      const token = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      vi.mocked(invoke).mockResolvedValue(token);

      await authService.login('test@example.com', 'password123');

      const stored = localStorage.getItem('auth_token');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toEqual(token);
    });

    it('should throw error on login failure', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Invalid credentials'));

      await expect(authService.login('test@example.com', 'wrong-password')).rejects.toThrow(
        'Login failed',
      );
    });
  });

  describe('Logout', () => {
    it('should logout successfully', async () => {
      const token = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      vi.mocked(invoke).mockResolvedValue(token);
      await authService.login('test@example.com', 'password123');

      vi.mocked(invoke).mockResolvedValue(undefined);
      await authService.logout();

      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.getAccessToken()).toBeNull();
      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('should clear token even if logout call fails', async () => {
      const token = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      vi.mocked(invoke).mockResolvedValue(token);
      await authService.login('test@example.com', 'password123');

      vi.mocked(invoke).mockRejectedValue(new Error('Logout failed'));
      await authService.logout();

      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.getAccessToken()).toBeNull();
    });
  });

  describe('Token Validation', () => {
    it('should validate token successfully', async () => {
      const token = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      vi.mocked(invoke).mockResolvedValueOnce(token);
      await authService.login('test@example.com', 'password123');

      vi.mocked(invoke).mockResolvedValueOnce(true);
      const isValid = await authService.validateToken();

      expect(isValid).toBe(true);
      expect(invoke).toHaveBeenCalledWith('auth_validate_token', {
        accessToken: 'test-token',
      });
    });

    it('should return false for invalid token', async () => {
      const token = {
        access_token: 'invalid-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      vi.mocked(invoke).mockResolvedValueOnce(token);
      await authService.login('test@example.com', 'password123');

      vi.mocked(invoke).mockResolvedValueOnce(false);
      const isValid = await authService.validateToken();

      expect(isValid).toBe(false);
    });

    it('should return false when no token exists', async () => {
      const isValid = await authService.validateToken();
      expect(isValid).toBe(false);
    });
  });

  describe('Password Change', () => {
    it('should change password successfully', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      await authService.changePassword('user-123', 'oldPass', 'newPass');

      expect(invoke).toHaveBeenCalledWith('auth_change_password', {
        userId: 'user-123',
        oldPassword: 'oldPass',
        newPassword: 'newPass',
      });
    });

    it('should throw error on password change failure', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Wrong password'));

      await expect(authService.changePassword('user-123', 'wrongPass', 'newPass')).rejects.toThrow(
        'Password change failed',
      );
    });
  });
});
