'use client';

import { useRef, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERSONAL_WORKSPACE_SELECTOR } from '@agiworkforce/types';
import {
  MANAGED_CLOUD_WORKSPACES_PATH,
  ManagedCloudAccountWorkspacesSchema,
  type ManagedCloudAccountWorkspaces,
} from '@agiworkforce/cloud-contracts';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { toUserMessage } from '@/lib/user-error-message';
import { finalizeWorkspaceSwitch } from '@/features/workspaces/lib/workspace-cache-scope';
import {
  admitWorkspace,
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
  observeWorkspaceOwner,
  subscribeWorkspaceAdmission,
  workspaceAdmissionRevision,
  workspaceOwnerIsCurrent,
  workspaceQueryKey,
  failWorkspaceRead,
  retryWorkspaceRead,
  type WorkspaceOwner,
} from '../lib/workspace-admission';

export const WORKSPACES_QUERY_KEY = ['workspaces'] as const;
export type AccountWorkspaces = ManagedCloudAccountWorkspaces;

function workspaceScopeKey(data: AccountWorkspaces): string {
  return JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId]);
}

async function readApiError(res: Response, fallback: string): Promise<Error> {
  let raw = '';
  try {
    const body = (await res.json()) as { error?: { message?: unknown } | string } | null;
    const message = typeof body?.error === 'string' ? body.error : body?.error?.message;
    if (typeof message === 'string') raw = message;
  } catch {
    raw = '';
  }
  const error = Object.assign(new Error(raw), { status: res.status });
  error.message = toUserMessage(error, fallback);
  return error;
}

async function readWorkspaces(
  authority: RequestAuthority,
  signal?: AbortSignal,
): Promise<AccountWorkspaces> {
  const res = await authority.fetch(MANAGED_CLOUD_WORKSPACES_PATH, { signal, cache: 'no-store' });
  if (!res.ok) throw await readApiError(res, 'We could not load your workspaces. Try again.');
  const data = ManagedCloudAccountWorkspacesSchema.parse(await res.json());
  authority.assertCurrent();
  return data;
}

function useWorkspaceOwner() {
  const snapshot = useSessionSnapshot();
  useSyncExternalStore(subscribeWorkspaceAdmission, workspaceAdmissionRevision, () => 0);
  return observeWorkspaceOwner(snapshot());
}

export function useAccountWorkspaces() {
  const owner = useWorkspaceOwner();
  const epoch = owner?.epoch;
  const canRead = !!owner && (owner.phase === 'resolving' || owner.phase === 'admitted');
  const query = useQuery({
    queryKey: owner ? workspaceQueryKey(owner) : [...WORKSPACES_QUERY_KEY, 'unavailable'],
    enabled: canRead,
    queryFn: async ({ signal }) => {
      if (!owner || epoch === undefined || !canRead) throw new Error('Workspaces are unavailable.');
      const authority = createRequestAuthority(owner.session, () =>
        workspaceOwnerIsCurrent(owner, epoch),
      );
      try {
        const data = await readWorkspaces(authority, signal);
        admitWorkspace(owner, epoch, workspaceScopeKey(data));
        return data;
      } catch (error) {
        if (!signal.aborted) failWorkspaceRead(owner, epoch);
        throw error;
      } finally {
        authority.retire();
      }
    },
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const admitted =
    !!owner &&
    epoch !== undefined &&
    owner.phase === 'admitted' &&
    workspaceOwnerIsCurrent(owner, epoch);
  return {
    ...query,
    refetch: () => {
      if (owner?.phase === 'unavailable') retryWorkspaceRead(owner);
      else if (canRead) return query.refetch();
    },
    data: admitted ? query.data : undefined,
    isLoading: canRead && query.isLoading,
    isUnavailable: !admitted && !query.isLoading,
    isSwitching: owner?.phase === 'switching',
    requiresReload: owner?.phase === 'uncertain',
  };
}

export function useSelectWorkspace(kind: 'workspace' | 'organization' = 'workspace') {
  return useWorkspaceSelectionMutation<string | null>((workspaceId) => ({
    url: kind === 'workspace' ? MANAGED_CLOUD_WORKSPACES_PATH : '/api/settings/organization/active',
    method: 'PUT',
    body:
      kind === 'workspace'
        ? { workspaceId: workspaceId ?? PERSONAL_WORKSPACE_SELECTOR }
        : { organizationId: workspaceId },
  }));
}

export function useWorkspaceSelectionMutation<Input>(
  request: (input: Input) => {
    url: string;
    method: 'POST' | 'PUT';
    body: unknown;
    errorMessage?: string;
  },
) {
  const accountWorkspaces = useAccountWorkspaces();
  const queryClient = useQueryClient();
  const owner = useWorkspaceOwner();
  const capturedEpoch = owner?.epoch;
  const attempt = useRef<{ owner: WorkspaceOwner; epoch: number } | null>(null);
  const mutation = useMutation({
    retry: false,
    // Errors render in the owner-bound controls, not the global mutation toast.
    onError: () => undefined,
    mutationFn: async ({
      input,
      owner,
      expectedEpoch,
      request: capturedRequest,
    }: {
      input: Input;
      owner: WorkspaceOwner | null;
      expectedEpoch: number | undefined;
      request: typeof request;
    }) => {
      if (!owner) throw new Error('Sign in to select a workspace.');
      if (expectedEpoch === undefined) throw new Error('Workspaces are unavailable.');
      attempt.current = { owner, epoch: expectedEpoch };
      const epoch = beginWorkspaceSwitch(owner, expectedEpoch);
      attempt.current = { owner, epoch };
      const authority = createRequestAuthority(owner.session, () =>
        workspaceOwnerIsCurrent(owner, epoch),
      );
      let rejected = false;
      try {
        const operation = capturedRequest(input);
        const response = await authority.fetch(operation.url, {
          method: operation.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(operation.body),
        });
        rejected = response.status >= 400 && response.status < 500;
        if (!response.ok)
          throw await readApiError(
            response,
            operation.errorMessage ?? 'We could not switch workspaces. Try again.',
          );
        const data = await readWorkspaces(authority);
        authority.assertCurrent();
        await finalizeWorkspaceSwitch(queryClient, data.activeOrganizationId, authority);
        return data;
      } catch (error) {
        if (authority.isCurrent()) {
          // A read cannot prove an interrupted PUT has stopped executing on the server.
          const uncertain = !rejected;
          try {
            const data = await readWorkspaces(authority);
            if (!uncertain) {
              finishWorkspaceSwitch(owner, epoch, false);
              queryClient.setQueryData(workspaceQueryKey(owner), data);
              admitWorkspace(owner, epoch, workspaceScopeKey(data));
            }
          } catch {
            // Keep admission closed when authoritative scope cannot be resolved.
          }
        }
        throw error;
      } finally {
        if (owner.phase === 'switching') finishWorkspaceSwitch(owner, epoch, true);
        authority.retire();
      }
    },
  });
  const current = attempt.current;
  const ownsResult =
    !!current && current.owner === owner && workspaceOwnerIsCurrent(current.owner, current.epoch);
  return {
    ...mutation,
    ownerKey: owner ? `${owner.incarnation}:${capturedEpoch}` : null,
    accountWorkspaces: accountWorkspaces.data,
    canMutate: !!owner && owner.phase === 'admitted',
    mutate: (input: Input) =>
      mutation.mutate({ input, owner, expectedEpoch: capturedEpoch, request }),
    mutateAsync: (input: Input) =>
      mutation.mutateAsync({ input, owner, expectedEpoch: capturedEpoch, request }),
    variables: ownsResult ? mutation.variables?.input : undefined,
    data: ownsResult ? mutation.data : undefined,
    error: ownsResult ? mutation.error : null,
    isError: ownsResult && mutation.isError,
    isPending: ownsResult && mutation.isPending,
    isSuccess: ownsResult && mutation.isSuccess,
    requiresReload: owner?.phase === 'uncertain',
  };
}
