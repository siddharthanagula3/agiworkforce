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
  /** Canonical display name resolved by GET /api/me (PER-8). */
  name?: string;
  /**
   * What the assistant should call the user. Resolved server-side from the
   * `general` settings namespace — PER-2: the greeting used to read a
   * `localStorage['agi.profile.preferredName']` key that nothing in the
   * repository ever wrote.
   */
  preferredName?: string;
  /** Self-described role from Settings → General, when set. */
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

  /**
   * End the Clerk session.
   *
   * This used to return `{ error: null }` without doing anything. Call sites
   * that also invoke `useClerk().signOut()` themselves were unaffected, but the
   * ones that only call `useAuthStore.logout()` — the chat header's "Log out"
   * button and the inactivity auto-logout — merely cleared local state: the
   * Clerk session cookie survived, so the next `resyncSession()` resolved
   * `/api/me` again and signed the user straight back in.
   *
   * Clerk's browser instance is the only sign-out surface reachable from a
   * plain module, and signing out twice is a no-op, so the call sites that
   * already sign out stay correct.
   */
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
