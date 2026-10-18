import { parseMeResponse } from '@agiworkforce/cloud-contracts';
import { isDesktopHost } from '@/features/desktop-host/lib/host';
import { signedOutRedirectUrl } from '@/lib/identity/client';
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

  /**
   * This is the sign-out that actually navigates.
   *
   * Every caller follows it with `identitySignOut({ redirectUrl })`, and that
   * second call never runs: the provider has already sent the page to its own
   * after-sign-out URL, the marketing home. In a browser that is the intended
   * destination. Inside the desktop shell it is a page the shell hands to the
   * browser, so the window stayed on the screen the user had just signed out
   * of; the destination is resolved here instead.
   */
  async logout(): Promise<{ error: string | null }> {
    if (typeof window === 'undefined') return { error: null };
    const clerk = (window as unknown as Record<string, unknown>)['Clerk'] as
      { signOut?: (options?: { redirectUrl?: string }) => Promise<void> } | undefined;
    if (typeof clerk?.signOut !== 'function') return { error: null };
    const redirectUrl = signedOutRedirectUrl(undefined, isDesktopHost());
    try {
      await (redirectUrl === undefined ? clerk.signOut() : clerk.signOut({ redirectUrl }));
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export const authService = new AuthService();
