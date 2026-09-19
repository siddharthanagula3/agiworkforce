'use client';

import type { QueryClient } from '@tanstack/react-query';
import { applyCacheScope, useAuthStore } from '@shared/stores/authentication-store';

const STABLE_CHAT_ROUTES = new Set([
  'artifacts',
  'code',
  'customize',
  'from-share',
  'library',
  'projects',
  'schedules',
  'study',
]);

export function workspaceSwitchDestination(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'chat' && segments[1] === 'projects' && segments.length > 2) {
    return '/chat/projects';
  }
  if (
    segments[0] === 'chat' &&
    segments.length === 2 &&
    !STABLE_CHAT_ROUTES.has(segments[1] ?? '')
  ) {
    return '/chat';
  }
  if (segments[0] === 'code' && segments.length > 1) return '/code';
  return null;
}

function navigateAfterWorkspaceSwitch(destination: string | null): void {
  if (destination) {
    window.location.replace(destination);
    return;
  }
  window.location.reload();
}

export async function finalizeWorkspaceSwitch(
  queryClient: QueryClient,
  activeOrganizationId: string | null,
  navigate: (destination: string | null) => void = navigateAfterWorkspaceSwitch,
): Promise<void> {
  // Cancel first so a response issued under the previous workspace cannot repopulate the cache.
  await queryClient.cancelQueries();
  await applyCacheScope({
    accountId: useAuthStore.getState().user?.id ?? null,
    workspaceId: activeOrganizationId,
  });
  queryClient.clear();
  navigate(workspaceSwitchDestination(window.location.pathname));
}
