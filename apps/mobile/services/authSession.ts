import { getClerkInstance } from '@clerk/expo';
import { SURFACE_TOKEN_HEADER } from '@agiworkforce/types';
import {
  getClerkSurfaceToken,
  getClerkToken,
  getClerkTokenFresh,
  getClerkUserId,
  CLERK_PUBLISHABLE_KEY,
} from '@/src/integrations/clerk';

export async function getAuthToken(): Promise<string | null> {
  return getClerkToken();
}

// The gateway admits a phone's session token only beside its surface proof.
// `secureFetch` adds the proof to its own requests, but the image loader, file
// transfers and web views send these headers themselves, and a request that
// carries the bearer alone is refused with 401.
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (!token) return {};
  const proof = await getClerkSurfaceToken();
  return proof
    ? { Authorization: `Bearer ${token}`, [SURFACE_TOKEN_HEADER]: proof }
    : { Authorization: `Bearer ${token}` };
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

export async function getCurrentUserId(): Promise<string | null> {
  return getClerkUserId();
}
