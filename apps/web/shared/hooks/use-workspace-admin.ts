'use client';

import { useCurrentUser } from '@/lib/identity/client';

/**
 * Whether the signed-in user holds the organisation admin/owner role.
 *
 * Mirrors the org-role half of `app/admin/layout.tsx`, which reads the same
 * Clerk `publicMetadata.role` server-side and redirects anyone else away. It
 * says nothing about platform-operator standing (an allowlist that never
 * reaches the client), so it may only gate org-scoped destinations, and only
 * as an offer, the route's own server-side gate is the boundary.
 */
export function useIsWorkspaceAdmin(): boolean {
  const { user, isLoaded } = useCurrentUser();
  if (!isLoaded || !user) return false;
  const role = (user.publicMetadata as Record<string, unknown> | null | undefined)?.['role'];
  return role === 'admin' || role === 'owner';
}
