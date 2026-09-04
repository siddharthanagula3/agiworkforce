import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { createError } from '@/lib/errors';
import {
  getCachedActiveOrganizationId,
  setCachedActiveOrganizationId,
} from '@/lib/server/request-context-cache';

export const PERSONAL_WORKSPACE_KEY = MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WorkspaceMembershipSummary {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
}

interface WorkspaceScopedRequest {
  headers: { get(name: string): string | null };
}

export async function resolveActiveOrganizationId(
  db: DatabaseAdapter,
  userId: string,
  request?: WorkspaceScopedRequest,
): Promise<string | null> {
  const requested = request?.headers.get(MANAGED_CLOUD_ORGANIZATION_HEADER)?.trim();
  if (requested) {
    if (requested === MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE) return null;
    if (!UUID_RE.test(requested)) {
      throw createError.validation('Invalid Managed Cloud workspace selector');
    }
    const cached = await getCachedActiveOrganizationId(userId);
    if (cached === requested) return requested;
    const membershipId = await resolveOrganizationMembershipId(db, userId, requested);
    if (!membershipId) {
      throw createError.forbidden('You are not a member of that workspace');
    }
    return membershipId;
  }

  const cached = await getCachedActiveOrganizationId(userId);
  if (cached !== undefined) return cached;

  const [row] = await db.query<{ organization_id: string }>(
    `select m.organization_id
       from public.user_settings s
       join public.organization_members m
         on m.user_id = s.user_id
        and m.organization_id::text = s.settings #>> '{workspace,activeOrganizationId}'
      where s.user_id = $1
      limit 1`,
    [userId],
  );
  const organizationId = row?.organization_id ?? null;
  await setCachedActiveOrganizationId(userId, organizationId);
  return organizationId;
}

export async function resolveOrganizationMembershipId(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string,
): Promise<string | null> {
  if (!UUID_RE.test(organizationId)) return null;
  const [membership] = await db.query<{ organization_id: string }>(
    `select organization_id
       from public.organization_members
      where organization_id = $1 and user_id = $2
      limit 1`,
    [organizationId, userId],
  );
  return membership?.organization_id ?? null;
}

export async function listWorkspaceMemberships(
  db: DatabaseAdapter,
  userId: string,
): Promise<WorkspaceMembershipSummary[]> {
  const rows = await db.query<{
    id: string;
    name: string;
    slug: string;
    role: WorkspaceMembershipSummary['role'];
    joined_at: string;
  }>(
    `select o.id, o.name, o.slug, m.role, m.joined_at
       from public.organization_members m
       join public.organizations o on o.id = m.organization_id
      where m.user_id = $1
      order by lower(o.name), m.joined_at asc`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

async function writeActiveWorkspaceSelection(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<void> {
  const value = organizationId ?? PERSONAL_WORKSPACE_KEY;
  if (organizationId && !UUID_RE.test(organizationId)) {
    throw createError.validation('organizationId must be a UUID or null');
  }

  await db.execute(
    `insert into public.user_settings (user_id, settings, updated_at)
     values (
       $1,
       jsonb_build_object('workspace', jsonb_build_object('activeOrganizationId', $2::text)),
       timezone('utc'::text, now())
     )
     on conflict (user_id) do update
       set settings = coalesce(public.user_settings.settings, '{}'::jsonb)
         || jsonb_build_object(
           'workspace',
           coalesce(public.user_settings.settings -> 'workspace', '{}'::jsonb)
             || jsonb_build_object('activeOrganizationId', $2::text)
         ),
       updated_at = timezone('utc'::text, now())`,
    [userId, value],
  );

  await setCachedActiveOrganizationId(userId, organizationId);
}

export async function persistActiveWorkspaceSelection(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<void> {
  if (organizationId) {
    const membershipId = await resolveOrganizationMembershipId(db, userId, organizationId);
    if (!membershipId) {
      throw createError.forbidden('You are not a member of that workspace');
    }
  }
  await writeActiveWorkspaceSelection(db, userId, organizationId);
}

export async function persistProvenActiveWorkspaceSelection(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string,
): Promise<void> {
  await writeActiveWorkspaceSelection(db, userId, organizationId);
}
