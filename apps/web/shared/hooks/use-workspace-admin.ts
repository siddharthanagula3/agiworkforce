'use client';

import { useUser } from '@clerk/nextjs';

/**
 * Whether the signed-in user holds the role the /admin console requires.
 *
 * Mirrors the check in `app/admin/layout.tsx`, which reads the same Clerk
 * `publicMetadata.role` server-side and redirects anyone else away. This is
 * only used to decide whether to *offer* the destination — the route's own
 * gate is the boundary, and it is unchanged.
 */
export function useIsWorkspaceAdmin(): boolean {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user) return false;
  const role = (user.publicMetadata as Record<string, unknown> | null | undefined)?.['role'];
  return role === 'admin' || role === 'owner';
}
