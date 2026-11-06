'use client';

import { useLayoutEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  observeWorkspaceOwner,
  subscribeWorkspaceAdmission,
  workspaceOwnerIsCurrent,
} from '@/features/workspaces/lib/workspace-admission';

export interface DeveloperQueryScope {
  request: RequestAuthority;
  headers: Record<string, string>;
}

export function useDeveloperQuery<T>(
  key: readonly string[],
  read: (scope: DeveloperQueryScope) => Promise<T>,
) {
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const epoch = owner?.epoch;
  const data = workspace.data;
  const scopeKey = data
    ? JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId])
    : null;
  const organizationId = data?.activeOrganizationId ?? null;
  const lifetime = useMemo(() => ({ active: false }), [owner, epoch, scopeKey]);
  useLayoutEffect(() => {
    lifetime.active = true;
    return () => {
      lifetime.active = false;
    };
  }, [lifetime]);
  const current = () =>
    !!owner &&
    epoch !== undefined &&
    scopeKey !== null &&
    owner.phase === 'admitted' &&
    owner.scopeKey === scopeKey &&
    workspaceOwnerIsCurrent(owner, epoch);
  const query = useQuery<T, Error>({
    queryKey: owner
      ? [...key, owner.session.userId, owner.session.sessionId, owner.incarnation, epoch, scopeKey]
      : [...key, 'unavailable'],
    enabled: current(),
    meta: { silent: true },
    queryFn: async ({ signal }) => {
      if (!owner || !current()) throw new DOMException('Request owner changed', 'AbortError');
      const request = createRequestAuthority(owner.session, () => current() && !signal.aborted);
      signal.addEventListener('abort', request.retire, { once: true });
      const stop = subscribeWorkspaceAdmission(() => {
        if (!current()) request.retire();
      });
      try {
        const result = await read({
          request,
          headers: {
            [MANAGED_CLOUD_ORGANIZATION_HEADER]:
              organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
          },
        });
        request.assertCurrent();
        return result;
      } finally {
        signal.removeEventListener('abort', request.retire);
        stop();
        request.retire();
      }
    },
  });
  const admitted = current();
  const isLoading = workspace.isLoading || (admitted && query.isPending);
  const error = admitted ? query.error : workspace.isLoading ? null : new Error(
    workspace.requiresReload
      ? 'Reload this page to confirm your workspace before loading developer data.'
      : 'Developer data is unavailable until your account and workspace are ready.',
  );
  return {
    data: admitted ? query.data : undefined,
    error,
    isLoading,
    isError: error !== null,
    isFetching: admitted && query.isFetching,
    isSuccess: admitted && query.isSuccess,
    refetch: async (): Promise<void> => {
      if (!lifetime.active || !owner || epoch === undefined || !workspaceOwnerIsCurrent(owner, epoch)) {
        return;
      }
      if (!current()) {
        await workspace.refetch();
        return;
      }
      await query.refetch();
    },
  };
}
