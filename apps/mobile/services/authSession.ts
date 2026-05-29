/**
 * Mobile auth session facade.
 *
 * Mobile v1 does not own a direct database/auth platform client. Cloud
 * account state is expected to come from Clerk-authenticated Web/API routes
 * backed by Neon once the gated Cloud path is enabled.
 */

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
  return null;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function refreshAuthSession(): Promise<boolean> {
  return false;
}

export async function clearAuthSession(): Promise<void> {
  // No direct mobile platform session is stored in v1.
}

export async function getCurrentUser(): Promise<MobileAuthUser | null> {
  return null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}
