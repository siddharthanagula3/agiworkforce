/**
 * Mobile auth session facade.
 *
 * Cloud account state comes from Clerk (@clerk/expo). This facade bridges the
 * Clerk session to the non-React callers that need a Bearer token — primarily
 * the cloud streaming path in services/streaming.ts. Clerk's token cache
 * (expo-secure-store) persists the session across launches.
 */

import { getClerkInstance } from '@clerk/expo';
import {
  getClerkToken,
  getClerkTokenFresh,
  getClerkUserId,
  CLERK_PUBLISHABLE_KEY,
} from '@/src/integrations/clerk';

export interface MobileAuthUser {
  id: string;
  email?: string | null;
  created_at?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
    [key: string]: unknown;
  } | null;
}

export interface MobileAuthSession {
  access_token: string;
  user: MobileAuthUser;
}

/** Current Clerk session JWT, or null when signed out. */
export async function getAuthToken(): Promise<string | null> {
  return getClerkToken();
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Force a fresh Clerk session token, bypassing the in-memory cache.
 * Called by the 401-retry path in api.ts — using the cache here would hand
 * back the same rejected token, making the retry useless. `skipCache: true`
 * triggers a FAPI call so the retry carries a freshly-issued JWT.
 * Returns true if a live session exists after the refresh attempt.
 */
export async function refreshAuthSession(): Promise<boolean> {
  try {
    const token = await getClerkTokenFresh();
    return token !== null;
  } catch {
    return false;
  }
}

export async function clearAuthSession(): Promise<void> {
  try {
    await getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY }).signOut();
  } catch {
    // Best-effort sign-out; Clerk clears its own SecureStore cache.
  }
}

export async function getCurrentUser(): Promise<MobileAuthUser | null> {
  try {
    const user = getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY }).user;
    if (!user) return null;
    return {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      created_at: user.createdAt ? new Date(user.createdAt).toISOString() : null,
      user_metadata: {
        full_name: user.fullName ?? null,
        name: user.firstName ?? null,
      },
    };
  } catch {
    return null;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  return getClerkUserId();
}
