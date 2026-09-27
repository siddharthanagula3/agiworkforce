import { vi } from 'vitest';
import {
  BUILT_IN_ORGANIZATION_ROLES,
  builtInRoleKeyForMembershipRole,
  expandOrganizationPermissions,
  type OrganizationRole,
} from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { hashAdminApiKey } from '@/lib/server/admin-api-keys';

export const ORG = '11111111-1111-4111-8111-111111111111';
export const PRINCIPAL_ID = '33333333-3333-4333-8333-333333333333';
export const KEY_ID = '44444444-4444-4444-8444-444444444444';
export const KEY_TOKEN = `agiadm_AbCdEf12_${'x'.repeat(43)}`;
export const KEY_ACTOR = `service_principal:${PRINCIPAL_ID}`;

export type MemberStatus = 'invited' | 'active' | 'suspended' | 'deprovisioned';

export interface WorldMember {
  user_id: string;
  role: OrganizationRole;
  status: MemberStatus;
  email: string;
  display_name: string | null;
  joined_at: string;
  provisioning_source: string | null;
  permissions?: string[];
}

export interface WorkspaceAdminWorld {
  members: WorldMember[];
  keyScopes: string[] | null;
  usageRows: Array<Record<string, unknown>>;
}

export interface SessionHolder {
  userId: string;
  role: OrganizationRole;
}

export function member(
  userId: string,
  role: OrganizationRole,
  over: Partial<WorldMember> = {},
): WorldMember {
  return {
    user_id: userId,
    role,
    status: 'active',
    email: `${userId}@example.com`,
    display_name: userId,
    joined_at: '2026-09-01T00:00:00.000Z',
    provisioning_source: 'manual',
    ...over,
  };
}

export function defaultWorld(): WorkspaceAdminWorld {
  return {
    members: [
      member('user-owner', 'owner'),
      member('user-admin', 'admin'),
      member('user-member', 'member'),
      member('user-viewer', 'viewer'),
      member('user-invited', 'member', { status: 'invited' }),
    ],
    keyScopes: ['admin.members.manage', 'admin.billing.view'],
    usageRows: [],
  };
}

export function heldPermissions(role: OrganizationRole): Set<string> {
  return expandOrganizationPermissions(
    BUILT_IN_ORGANIZATION_ROLES[builtInRoleKeyForMembershipRole(role)].permissions,
  );
}

export function permissionServiceMock(session: SessionHolder) {
  return {
    resolveOrganizationPermissions: vi.fn(async () => heldPermissions(session.role)),
    requireMemberPermission: vi.fn(
      async (_organizationId: string, _userId: string, permission: string, message: string) => {
        const permissions = heldPermissions(session.role);
        if (!permissions.has(permission)) throw createError.forbidden(message).asUserSafe();
        return permissions;
      },
    ),
  };
}

function norm(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function memberRow(entry: WorldMember) {
  return {
    organization_id: ORG,
    user_id: entry.user_id,
    role: entry.role,
    status: entry.status,
    provisioning_source: entry.provisioning_source,
    provisioned_at: null,
    joined_at: entry.joined_at,
  };
}

function workspaceMemberRow(entry: WorldMember) {
  return {
    user_id: entry.user_id,
    role: entry.role,
    status: entry.status,
    joined_at: entry.joined_at,
    provisioning_source: entry.provisioning_source,
    email: entry.email,
    display_name: entry.display_name,
  };
}

export function createWorkspaceAdminDb(world: WorkspaceAdminWorld) {
  const find = (userId: unknown) => world.members.find((entry) => entry.user_id === userId);

  const query = vi.fn(async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const q = norm(sql);
    if (q.startsWith('update public.organization_admin_api_keys k set last_used_at')) {
      if (world.keyScopes === null || params[0] !== hashAdminApiKey(KEY_TOKEN)) return [];
      return [
        {
          id: KEY_ID,
          organization_id: ORG,
          key_hash: params[0],
          scopes: world.keyScopes,
          service_principal_id: PRINCIPAL_ID,
          principal_name: 'Directory automation',
          principal_max_scopes: world.keyScopes,
          principal_disabled_at: null,
        },
      ];
    }
    if (q.includes('from public.organization_admin_policies')) return [];
    if (q.includes('from public.user_settings s')) {
      return find(params[0])?.status === 'active' ? [{ organization_id: ORG }] : [];
    }
    if (q.startsWith('select organization_id, role from public.organization_members')) {
      const entry = find(params[1]);
      return entry?.status === 'active' ? [{ organization_id: ORG, role: entry.role }] : [];
    }
    if (q.includes('pg_advisory_xact_lock')) return [];
    if (q.startsWith('select organization_id, user_id, role, status, provisioning_source')) {
      const entry = find(params[1]);
      return entry ? [memberRow(entry)] : [];
    }
    if (q.includes('as owner_count')) {
      const owners = world.members.filter((entry) => entry.role === 'owner').length;
      return [{ owner_count: String(owners) }];
    }
    if (q.includes('public.organization_member_permissions(')) {
      const entry = find(params[1]);
      return [{ permissions: entry?.permissions ?? [...heldPermissions(entry?.role ?? 'viewer')] }];
    }
    if (q.includes('from public.organization_members om') && q.includes('om.user_id = $2')) {
      const entry = find(params[1]);
      return entry ? [workspaceMemberRow(entry)] : [];
    }
    if (q.includes('from public.organization_members om')) {
      const [, afterId, email, limit] = params as [string, string | null, string | null, number];
      return world.members
        .filter((entry) => entry.status === 'active')
        .filter((entry) => afterId === null || entry.user_id > afterId)
        .filter((entry) => email === null || entry.email.toLowerCase() === email.toLowerCase())
        .sort((a, b) => a.user_id.localeCompare(b.user_id))
        .slice(0, limit)
        .map(workspaceMemberRow);
    }
    if (q.includes('from public.managed_usage_requests')) return world.usageRows;
    return [];
  });

  const execute = vi.fn(async (sql: string, params: unknown[] = []): Promise<number> => {
    const q = norm(sql);
    if (q.startsWith('update public.organization_members set role = $1')) {
      const entry = find(params[2]);
      if (!entry) return 0;
      entry.role = params[0] as OrganizationRole;
      return 1;
    }
    if (q.startsWith('delete from public.organization_members')) {
      const before = world.members.length;
      world.members = world.members.filter((entry) => entry.user_id !== params[1]);
      return before - world.members.length;
    }
    return 0;
  });

  const db = {
    query,
    execute,
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db),
  };
  return db;
}

export function keyHeaders(): Record<string, string> {
  return { authorization: `Bearer ${KEY_TOKEN}` };
}
