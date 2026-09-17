'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  OrganizationPermission,
  OrganizationRole,
  WorkspaceControlsLayer,
  WorkspacePolicyOverride,
  WorkspacePolicyOverrideSubject,
} from '@agiworkforce/types';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

export interface WorkspaceRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
  builtIn: boolean;
  assignable: boolean;
  permissions: OrganizationPermission[];
  memberCount: number;
  groupCount: number;
}

export interface WorkspaceRolesResult {
  organizationId: string;
  currentUserId: string;
  currentUserRole: OrganizationRole;
  currentUserPermissions: OrganizationPermission[];
  canManageRoles: boolean;
  canManageGroups: boolean;
  grantablePermissions: OrganizationPermission[];
  primaryOwnerOnlyPermissions: OrganizationPermission[];
  roles: WorkspaceRole[];
  memberRoleGrants: Record<string, string[]>;
}

export interface WorkspaceDirectoryGroup {
  id: string;
  displayName: string;
  memberCount: number;
  roleIds: string[];
  managerUserIds: string[];
}

export interface WorkspaceGroupsResult {
  organizationId: string;
  canManageGroups: boolean;
  groups: WorkspaceDirectoryGroup[];
}

export interface CustomRoleDraft {
  name: string;
  description: string | null;
  permissions: OrganizationPermission[];
}

export const WORKSPACE_ROLES_QUERY_KEY = ['workspace', 'roles'] as const;
export const WORKSPACE_GROUPS_QUERY_KEY = ['workspace', 'groups'] as const;
export const WORKSPACE_OVERRIDES_QUERY_KEY = ['workspace', 'policy-overrides'] as const;

async function readApiError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    const raw = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
    if (!raw.trim()) return fallback;
    return toUserMessage(Object.assign(new Error(raw), { status: res.status }), fallback);
  } catch {
    return fallback;
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');
  const method = init.method ?? 'GET';
  const baseHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.body) baseHeaders['Content-Type'] = 'application/json';
  const headers = method === 'GET' ? baseHeaders : await addCsrfHeaders(baseHeaders);
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as T;
}

async function readOrNull<T>(url: string): Promise<T | null> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as T;
}

export function useWorkspaceRoles(): UseQueryResult<WorkspaceRolesResult | null, Error> {
  return useQuery({
    queryKey: WORKSPACE_ROLES_QUERY_KEY,
    queryFn: () => readOrNull<WorkspaceRolesResult>('/api/settings/organization/roles'),
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load workspace roles' },
  });
}

export function useWorkspaceGroups(): UseQueryResult<WorkspaceGroupsResult | null, Error> {
  return useQuery({
    queryKey: WORKSPACE_GROUPS_QUERY_KEY,
    queryFn: () => readOrNull<WorkspaceGroupsResult>('/api/settings/organization/groups'),
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load directory groups' },
  });
}

function useInvalidatingMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  keys: readonly (readonly string[])[],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

export function useCreateWorkspaceRole() {
  return useInvalidatingMutation(
    (draft: CustomRoleDraft) =>
      request<{ role: WorkspaceRole }>('/api/settings/organization/roles', {
        method: 'POST',
        body: JSON.stringify(draft),
      }),
    [WORKSPACE_ROLES_QUERY_KEY],
  );
}

export function useUpdateWorkspaceRole() {
  return useInvalidatingMutation(
    ({ roleId, draft }: { roleId: string; draft: CustomRoleDraft }) =>
      request<{ role: WorkspaceRole }>(`/api/settings/organization/roles/${roleId}`, {
        method: 'PATCH',
        body: JSON.stringify(draft),
      }),
    [WORKSPACE_ROLES_QUERY_KEY],
  );
}

export function useDeleteWorkspaceRole() {
  return useInvalidatingMutation(
    (roleId: string) =>
      request<{ success: true }>(`/api/settings/organization/roles/${roleId}`, {
        method: 'DELETE',
      }),
    [WORKSPACE_ROLES_QUERY_KEY, WORKSPACE_GROUPS_QUERY_KEY, WORKSPACE_OVERRIDES_QUERY_KEY],
  );
}

export function useSetMemberRoles() {
  return useInvalidatingMutation(
    ({ userId, roleIds }: { userId: string; roleIds: string[] }) =>
      request(`/api/settings/organization/members/${encodeURIComponent(userId)}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roleIds }),
      }),
    [WORKSPACE_ROLES_QUERY_KEY],
  );
}

export function useSetGroupRoles() {
  return useInvalidatingMutation(
    ({ groupId, roleIds }: { groupId: string; roleIds: string[] }) =>
      request(`/api/settings/organization/groups/${groupId}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roleIds }),
      }),
    [WORKSPACE_GROUPS_QUERY_KEY, WORKSPACE_ROLES_QUERY_KEY],
  );
}

export function useSetGroupManagers() {
  return useInvalidatingMutation(
    ({ groupId, userIds }: { groupId: string; userIds: string[] }) =>
      request(`/api/settings/organization/groups/${groupId}/managers`, {
        method: 'PUT',
        body: JSON.stringify({ userIds }),
      }),
    [WORKSPACE_GROUPS_QUERY_KEY],
  );
}

export function usePolicyOverrides(
  enabled: boolean,
): UseQueryResult<{ overrides: WorkspacePolicyOverride[] } | null, Error> {
  return useQuery({
    queryKey: WORKSPACE_OVERRIDES_QUERY_KEY,
    queryFn: () =>
      readOrNull<{ overrides: WorkspacePolicyOverride[] }>(
        '/api/settings/organization/policy/overrides',
      ),
    enabled,
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load policy exceptions' },
  });
}

export function useUpsertPolicyOverride() {
  return useInvalidatingMutation(
    (input: {
      subjectType: WorkspacePolicyOverrideSubject;
      subjectId: string;
      layer: WorkspaceControlsLayer;
    }) =>
      request<{ override: WorkspacePolicyOverride }>(
        '/api/settings/organization/policy/overrides',
        { method: 'PUT', body: JSON.stringify(input) },
      ),
    [WORKSPACE_OVERRIDES_QUERY_KEY],
  );
}

export function useDeletePolicyOverride() {
  return useInvalidatingMutation(
    (overrideId: string) =>
      request<{ success: true }>(`/api/settings/organization/policy/overrides/${overrideId}`, {
        method: 'DELETE',
      }),
    [WORKSPACE_OVERRIDES_QUERY_KEY],
  );
}
