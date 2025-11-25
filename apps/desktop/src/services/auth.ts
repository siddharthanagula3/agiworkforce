import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../stores/authStore';

export interface AuthToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  last_login_at?: string;
}

export enum UserRole {
  Viewer = 'viewer',
  Editor = 'editor',
  Admin = 'admin',
}

export class AuthService {
  private static instance: AuthService;
  private token: AuthToken | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private readonly INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

  private constructor() {
    // Load token from localStorage on initialization
    this.loadToken();
    this.setupInactivityDetection();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Register a new user
   */
  async register(
    email: string,
    password: string,
    role: UserRole = UserRole.Editor,
  ): Promise<string> {
    try {
      const userId = await invoke<string>('auth_register', {
        email,
        password,
        role,
      });
      return userId;
    } catch (error) {
      throw new Error(`Registration failed: ${error}`);
    }
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<AuthToken> {
    try {
      const token = await invoke<AuthToken>('auth_login', {
        email,
        password,
      });

      this.token = token;
      this.saveToken(token);

      // CRITICAL FIX: Dispatch update to UI store immediately
      // In production, decode the JWT to get actual user details/role
      useAuthStore.getState().setUser({
        id: email,
        email: email,
        role: UserRole.Viewer, // Default to viewer, should be from token
      });

      this.startRefreshTimer();
      this.resetInactivityTimer();

      return token;
    } catch (error) {
      throw new Error(`Login failed: ${error}`);
    }
  }

  /**
   * Logout (clear session)
   */
  async logout(): Promise<void> {
    try {
      if (this.token) {
        await invoke('auth_logout', {
          accessToken: this.token.access_token,
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearToken();
      this.stopRefreshTimer();
      this.stopInactivityTimer();
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<AuthToken> {
    if (!this.token) {
      throw new Error('No token to refresh');
    }

    try {
      const newToken = await invoke<AuthToken>('auth_refresh_token', {
        refreshToken: this.token.refresh_token,
      });

      this.token = newToken;
      this.saveToken(newToken);

      return newToken;
    } catch (error) {
      // If refresh fails, logout
      await this.logout();
      throw new Error(`Token refresh failed: ${error}`);
    }
  }

  /**
   * Validate current token
   */
  async validateToken(): Promise<boolean> {
    if (!this.token) {
      return false;
    }

    try {
      const isValid = await invoke<boolean>('auth_validate_token', {
        accessToken: this.token.access_token,
      });

      if (isValid) {
        this.resetInactivityTimer();
      }

      return isValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Change password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    try {
      await invoke('auth_change_password', {
        userId,
        oldPassword,
        newPassword,
      });
    } catch (error) {
      throw new Error(`Password change failed: ${error}`);
    }
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.token?.access_token || null;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.token !== null;
  }

  /**
   * Save token to localStorage
   */
  private saveToken(token: AuthToken): void {
    localStorage.setItem('auth_token', JSON.stringify(token));
  }

  /**
   * Load token from localStorage
   */
  private loadToken(): void {
    const stored = localStorage.getItem('auth_token');
    if (stored) {
      try {
        this.token = JSON.parse(stored);
        this.startRefreshTimer();
      } catch (error) {
        console.error('Failed to parse stored token:', error);
        this.clearToken();
      }
    }
  }

  /**
   * Clear token from memory and storage
   */
  private clearToken(): void {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  /**
   * Start automatic token refresh timer
   */
  private startRefreshTimer(): void {
    this.stopRefreshTimer();

    if (this.token) {
      // Refresh 5 minutes before expiration
      const refreshTime = (this.token.expires_in - 5 * 60) * 1000;
      this.refreshTimer = setTimeout(() => {
        this.refreshToken().catch((error) => {
          console.error('Auto-refresh failed:', error);
        });
      }, refreshTime);
    }
  }

  /**
   * Stop automatic token refresh timer
   */
  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Setup inactivity detection
   */
  private setupInactivityDetection(): void {
    const resetTimer = () => this.resetInactivityTimer();

    // Listen for user activity
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('keydown', resetTimer);
      window.addEventListener('click', resetTimer);
      window.addEventListener('scroll', resetTimer);
    }
  }

  /**
   * Reset inactivity timer
   */
  private resetInactivityTimer(): void {
    this.stopInactivityTimer();

    if (this.token) {
      this.inactivityTimer = setTimeout(() => {
        this.logout();
      }, this.INACTIVITY_TIMEOUT);
    }
  }

  /**
   * Stop inactivity timer
   */
  private stopInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();
