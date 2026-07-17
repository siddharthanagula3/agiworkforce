/**
 * Authentication Service — Clerk adapter
 *
 * Wraps Clerk auth for the auth store. Login/register/password flows are
 * handled by Clerk UI components (<SignIn>, <SignUp>, etc.) and are no longer
 * callable from code. getCurrentUser() and logout() delegate to Clerk.
 */

import { logger } from '@shared/lib/logger';
import { parseMeResponse } from '@agiworkforce/cloud-contracts';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: string;
  plan?: string;
  user_metadata?: Record<string, unknown>;
}

export interface LoginData {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
  company?: string;
  phone?: string;
  location?: string;
}

export interface AuthResponse {
  user: AuthUser | null;
  error: string | null;
}

class AuthService {
  async getCurrentUser(): Promise<AuthResponse> {
    try {
      const response = await fetch('/api/me');
      if (!response.ok) {
        return { user: null, error: 'Not authenticated' };
      }
      // Validate against the shared /api/me contract (packages/services) —
      // a mismatch throws into the catch below instead of drifting silently.
      const data = parseMeResponse(await response.json());
      const authUser: AuthUser = {
        id: data.id,
        email: data.email || '',
        name: data.name,
        avatar: data.avatar_url ?? undefined,
        role: 'user',
        plan: data.plan.tier || 'free',
      };
      return { user: authUser, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { user: null, error: message };
    }
  }

  async login(_loginData: LoginData): Promise<AuthResponse> {
    logger.auth('login() is handled by Clerk <SignIn> component');
    return { user: null, error: 'Use Clerk sign-in flow' };
  }

  async register(_registerData: RegisterData): Promise<AuthResponse> {
    logger.auth('register() is handled by Clerk <SignUp> component');
    return { user: null, error: 'Use Clerk sign-up flow' };
  }

  async logout(): Promise<{ error: string | null }> {
    return { error: null };
  }

  async resetPassword(_email: string): Promise<{ error: string | null }> {
    return { error: 'Use Clerk forgot-password flow' };
  }

  async updatePassword(_newPassword: string): Promise<{ error: string | null }> {
    return { error: 'Use Clerk password management' };
  }

  async updateProfile(updates: Partial<AuthUser>): Promise<AuthResponse> {
    try {
      const response = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: updates.name,
          avatar_url: updates.avatar,
        }),
      });
      if (!response.ok) {
        return { user: null, error: 'Profile update failed' };
      }
      return this.getCurrentUser();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { user: null, error: message };
    }
  }

  async changePassword(
    _currentPassword: string,
    _newPassword: string,
  ): Promise<{ error: string | null }> {
    return { error: 'Use Clerk password management' };
  }
}

export const authService = new AuthService();
