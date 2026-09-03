'use client';

import { useUser } from '@clerk/nextjs';

export function useIsWorkspaceAdmin(): boolean {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user) return false;
  const role = (user.publicMetadata as Record<string, unknown> | null | undefined)?.['role'];
  return role === 'admin' || role === 'owner';
}
