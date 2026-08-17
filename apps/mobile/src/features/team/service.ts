import { api } from '@/services/api';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'member', 'viewer'];

export interface WorkspaceAccess {
  plan: string;
  canManageTeam: boolean;
  maxMembers: number | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  memberCount: number;
  maxMembers: number | null;
  currentUserRole: WorkspaceRole;
}

export interface WorkspaceMembership {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

export interface WorkspaceOverview {
  workspace: Workspace | null;
  access: WorkspaceAccess;
  activeWorkspaceId: string | null;
  workspaces: WorkspaceMembership[];
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: WorkspaceRole;
  isCurrentUser: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRole(value: unknown): WorkspaceRole {
  return WORKSPACE_ROLES.includes(value as WorkspaceRole) ? (value as WorkspaceRole) : 'member';
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export async function fetchWorkspaceOverview(signal?: AbortSignal): Promise<WorkspaceOverview> {
  const response = await api.get<unknown>(
    '/api/settings/organization',
    signal ? { signal } : undefined,
  );
  if (!isRecord(response)) {
    throw new Error('Workspace returned an invalid response.');
  }

  const rawAccess = isRecord(response['access']) ? response['access'] : {};
  const access: WorkspaceAccess = {
    plan: asString(rawAccess['plan'], 'free'),
    canManageTeam: rawAccess['canManageTeam'] === true,
    maxMembers: asNullableCount(rawAccess['maxMembers']),
  };

  const rawActiveId = response['activeOrganizationId'];
  const activeWorkspaceId = typeof rawActiveId === 'string' && rawActiveId ? rawActiveId : null;
  const rawWorkspaces = response['workspaces'];
  const workspaces = Array.isArray(rawWorkspaces)
    ? rawWorkspaces.flatMap((raw): WorkspaceMembership[] => {
        if (!isRecord(raw)) return [];
        const id = asString(raw['id']);
        if (!id) return [];
        return [
          {
            id,
            name: asString(raw['name'], 'Workspace'),
            slug: asString(raw['slug']),
            role: asRole(raw['role']),
          },
        ];
      })
    : [];

  const rawOrg = response['organization'];
  if (!isRecord(rawOrg)) {
    return { workspace: null, access, activeWorkspaceId, workspaces };
  }

  return {
    access,
    activeWorkspaceId,
    workspaces,
    workspace: {
      id: asString(rawOrg['id']),
      name: asString(rawOrg['name'], 'Workspace'),
      slug: asString(rawOrg['slug']),
      plan: asString(rawOrg['plan'], access.plan),
      memberCount: asNullableCount(rawOrg['memberCount']) ?? 0,
      maxMembers: asNullableCount(rawOrg['maxMembers']),
      currentUserRole: asRole(rawOrg['currentUserRole']),
    },
  };
}

export async function setActiveWorkspace(organizationId: string | null): Promise<void> {
  await api.put('/api/settings/organization/active', { organizationId });
}

export async function fetchWorkspaceMembers(
  organizationId: string,
  signal?: AbortSignal,
): Promise<WorkspaceMember[]> {
  const response = await api.get<unknown>(
    `/api/settings/team?organizationId=${encodeURIComponent(organizationId)}`,
    signal ? { signal } : undefined,
  );
  if (!isRecord(response) || !Array.isArray(response['members'])) return [];

  return response['members'].flatMap((raw): WorkspaceMember[] => {
    if (!isRecord(raw)) return [];
    const userId = asString(raw['userId']);
    if (!userId) return [];
    return [
      {
        id: asString(raw['id'], userId),
        userId,
        email: asString(raw['email']),
        name: asString(raw['name'], asString(raw['email'], userId)),
        role: asRole(raw['role']),
        isCurrentUser: raw['isCurrentUser'] === true,
      },
    ];
  });
}

export async function addWorkspaceMember(
  organizationId: string,
  email: string,
  role: WorkspaceRole,
): Promise<void> {
  await api.post('/api/settings/team', { organizationId, email, role });
}

export async function updateWorkspaceMemberRole(
  memberId: string,
  role: WorkspaceRole,
): Promise<void> {
  await api.patch(`/api/settings/team/${encodeURIComponent(memberId)}`, { role });
}

export async function removeWorkspaceMember(memberId: string): Promise<void> {
  await api.delete(`/api/settings/team/${encodeURIComponent(memberId)}`);
}
