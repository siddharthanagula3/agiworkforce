
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

export async function getAuthToken(): Promise<string | null> {
  return getClerkToken();
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
