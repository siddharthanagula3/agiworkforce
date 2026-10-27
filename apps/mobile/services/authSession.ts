import { getClerkInstance } from '@clerk/expo';
import {
  getClerkToken,
  getClerkTokenFresh,
  getClerkUserId,
  CLERK_PUBLISHABLE_KEY,
} from '@/src/integrations/clerk';

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

/**
 * Whether Clerk still holds a live session on this device. A refresh that failed
 * while this is true failed for the network, not because the account signed out.
 */
export function hasActiveAuthSession(): boolean {
  try {
    const status = getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY }).session?.status;
    return status === 'active' || status === 'pending';
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

export async function getCurrentUserId(): Promise<string | null> {
  return getClerkUserId();
}
