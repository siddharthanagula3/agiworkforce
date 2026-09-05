import { logger } from '@shared/lib/logger';
import { parseMeResponse } from '@agiworkforce/cloud-contracts';
import { requestMe } from './me-request';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  preferredName?: string;
  workDescription?: string;
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
  /**
   * True when `error` describes a failure that says nothing about whether the
   * session is still valid (a rate limit, a server error, a dropped
   * connection) rather than a definitive "not authenticated" answer. Callers
   * that cache the last known user should not erase it for a transient
   * failure.
   */
  transient?: boolean;
}

class AuthService {
  async getCurrentUser(): Promise<AuthResponse> {
    try {
      const response = await requestMe();
      if (!response.ok) {
        if (response.status === 401) return { user: null, error: 'Not authenticated' };
        return {
          user: null,
          error: `Could not confirm the session (HTTP ${response.status}).`,
          transient: true,
        };
      }
      const data = parseMeResponse(await response.json());
      const authUser: AuthUser = {
        id: data.id,
        email: data.email || '',
        name: data.name,
        ...(data.profile?.preferred_name ? { preferredName: data.profile.preferred_name } : {}),
        ...(data.profile?.work_description
          ? { workDescription: data.profile.work_description }
          : {}),
        avatar: data.avatar_url ?? undefined,
        role: 'user',
        plan: data.plan.tier || 'free',
      };
      return { user: authUser, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { user: null, error: message, transient: true };
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
    if (typeof window === 'undefined') return { error: null };
    const clerk = (window as unknown as Record<string, unknown>)['Clerk'] as
      | { signOut?: () => Promise<void> }
      | undefined;
    if (typeof clerk?.signOut !== 'function') return { error: null };
    try {
      await clerk.signOut();
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
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
