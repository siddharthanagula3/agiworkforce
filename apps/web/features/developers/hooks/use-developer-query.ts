'use client';

import {
  useWorkspaceQuery,
  type WorkspaceQueryOptions,
  type WorkspaceQueryScope,
} from '@/features/workspaces/hooks/use-workspace-query';

export type DeveloperQueryScope = WorkspaceQueryScope;
type DeveloperQueryOptions<T> = Pick<WorkspaceQueryOptions<T>, 'enabled' | 'refetchInterval'>;

export function useDeveloperQuery<T>(
  key: readonly string[],
  read: (scope: DeveloperQueryScope) => Promise<T>,
  options: DeveloperQueryOptions<T> = {},
) {
  return useWorkspaceQuery(key, read, {
    ...options,
    unavailableMessage: 'Developer data is unavailable until your account and workspace are ready.',
    reloadMessage: 'Reload this page to confirm your workspace before loading developer data.',
  });
}
