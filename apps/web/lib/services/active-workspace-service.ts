import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import {
  createWorkspaceKeyValueStore,
  defineCacheRegistry,
  purgeWorkspaceCache,
  type KeyValueStore,
  type WorkspaceCacheScope,
} from '@agiworkforce/key-value';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import {
  getCachedActiveOrganizationId,
  setCachedActiveOrganizationId,
} from '@/lib/server/request-context-cache';

export const PERSONAL_WORKSPACE_KEY = MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE;

export const WORKSPACE_SETTINGS_NAMESPACE = 'workspace';

/**
 * True when a generic settings write's top-level delta would replace the
 * `workspace` namespace (and with it `activeOrganizationId`), the row the
 * active-organization cache is keyed on. A caller that persists such a delta
 * outside `persistActiveWorkspaceSelection` must invalidate that user's
 * cached entry itself; nothing here writes the row.
 */
export function touchesActiveOrganizationNamespace(
  delta: Record<string, unknown> | null | undefined,
): boolean {
  return !!delta && Object.prototype.hasOwnProperty.call(delta, WORKSPACE_SETTINGS_NAMESPACE);
}

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

/**
 * The workspace the member last selected, read from the settings row alone.
 *
 * `resolveActiveOrganizationId` joins `organization_members`, so it answers
 * null the moment a membership is deleted. Offboarding needs the answer AFTER
 * that delete, to tell a member who was working in this workspace from one who
 * was not, so it reads the recorded selection rather than the resolved one.
 */
export async function readRecordedActiveWorkspaceId(
  db: DatabaseAdapter,
  userId: string,
): Promise<string | null> {
  const [row] = await db.query<{ organization_id: string | null }>(
    `select s.settings #>> '{workspace,activeOrganizationId}' as organization_id
       from public.user_settings s
      where s.user_id = $1
      limit 1`,
    [userId],
  );
  const value = row?.organization_id ?? null;
  return value && value !== PERSONAL_WORKSPACE_KEY && UUID_RE.test(value) ? value : null;
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

  const previous = await getCachedActiveOrganizationId(userId);

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

  if (previous !== undefined && previous !== organizationId) {
    await invalidateWorkspaceScopedCaches(userId, previous);
  }
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

/**
 * Every cache whose contents belong to one workspace. A cache absent from here
 * is not purged on a workspace switch, so adding a workspace-scoped cache
 * without registering it is the bug this registry exists to make visible.
 */
export const WORKSPACE_CACHE_REGISTRY = defineCacheRegistry([
  {
    id: 'personalization',
    namespace: 'personalization',
    sourceOfTruth: 'postgres',
    workspaceScoped: true,
    invalidatedBy: ['workspace-switch', 'record-write', 'ttl'],
  },
  {
    id: 'search-index',
    namespace: 'search-index',
    sourceOfTruth: 'postgres',
    workspaceScoped: true,
    invalidatedBy: ['workspace-switch', 'record-write', 'deletion', 'ttl'],
  },
  {
    id: 'notifications',
    namespace: 'notifications',
    sourceOfTruth: 'postgres',
    workspaceScoped: true,
    invalidatedBy: ['workspace-switch', 'record-write', 'ttl'],
  },
  {
    id: 'schedules',
    namespace: 'schedules',
    sourceOfTruth: 'postgres',
    workspaceScoped: true,
    invalidatedBy: ['workspace-switch', 'record-write', 'deletion', 'ttl'],
  },
]);

export type WorkspaceCacheId = 'personalization' | 'search-index' | 'notifications' | 'schedules';

export function workspaceCacheScope(
  userId: string,
  organizationId: string | null,
  cacheId?: WorkspaceCacheId,
): WorkspaceCacheScope {
  return { workspaceId: organizationId, userId, cacheId };
}

function resolveStore(): KeyValueStore | null {
  try {
    return getKeyValueStore();
  } catch {
    return null;
  }
}

/**
 * The only way a route should reach cached workspace data: the returned store
 * can address keys under this workspace and cache alone, so a stale binding
 * reads nothing rather than another workspace's entry.
 */
export function getWorkspaceScopedCache(
  cacheId: WorkspaceCacheId,
  userId: string,
  organizationId: string | null,
): KeyValueStore | null {
  if (!WORKSPACE_CACHE_REGISTRY.get(cacheId)) {
    throw createError.internal(`Unregistered workspace cache: ${cacheId}`);
  }
  const store = resolveStore();
  if (!store) return null;
  return createWorkspaceKeyValueStore(store, workspaceCacheScope(userId, organizationId, cacheId));
}

export async function invalidateWorkspaceScopedCaches(
  userId: string,
  organizationId: string | null,
): Promise<number> {
  const store = resolveStore();
  if (!store) return 0;
  try {
    return await purgeWorkspaceCache(store, workspaceCacheScope(userId, organizationId));
  } catch (err) {
    logger.warn(
      { err, userId },
      '[active-workspace] workspace cache purge failed; namespacing still isolates the switch',
    );
    return 0;
  }
}

/**
 * A stream that started in one workspace must not finish writing into another.
 * Callers hold the workspace they bound to and re-check it at each checkpoint.
 */
export async function assertWorkspaceBindingCurrent(
  db: DatabaseAdapter,
  userId: string,
  boundOrganizationId: string | null,
): Promise<void> {
  const current = await resolveActiveOrganizationId(db, userId);
  if (current !== boundOrganizationId) {
    throw createError.conflict('Your active workspace changed while this request was running');
  }
}
