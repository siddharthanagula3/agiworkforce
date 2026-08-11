/**
 * Cross-device cloud PROJECTS sync — delta sync (mirrors /api/chat/sync + /api/memory/sync).
 * Design: docs/plans/shared-cloud-state-2026-06-22.md
 *
 *   GET  /api/projects/sync?since=<server_version cursor>
 *        → user_projects rows with server_version > cursor (INCLUDING tombstones,
 *          deleted_at IS NOT NULL, so deletes propagate), scoped to the
 *          authenticated user, plus the next cursor + hasMore.
 *   POST /api/projects/sync  { projects: [...] }
 *        → compare-and-swap by id + baseVersion. user_id is set SERVER-SIDE from
 *          the verified session (never the body); RLS WITH CHECK is the backstop.
 *          Client wall clocks never participate. A stale write is rejected and
 *          the current server row is returned as the deterministic server winner.
 *          deletedAt is only a tombstone signal; the server owns the persisted
 *          deletion timestamp.
 *
 * Scope (v1): the CORE shareable project content — name, description, instructions,
 * color, is_archived, metadata. Local-specific routing hints (default_privacy_mode,
 * default_provider_mode, allowed_surfaces) are intentionally NOT synced so a project
 * created in one trust mode can't push a trust default onto another device. Knowledge-
 * file BYTES are out of scope (follow the media/blob path, not this delta JSON).
 *
 * Hardening: runs through getUserScopedDb (RLS-scoped) — NOT the app-layer-only
 * getNeonDb the CRUD routes use. Trust boundary: managed-cloud only; Local/BYOK
 * projects have no cloud_id and are never pushed/pulled (enforced client-side).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ProjectsSyncPushRequestSchema, ServerVersionSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  getProjectLimit,
  getProjectLimitErrorMessage,
  isUserResourceLimitError,
} from '@/lib/services/free-plan-entitlements';

const MAX_PROJECTS_PULL = 500;

// Wire shape from the shared cloud contract (restructure Wave 4) — enforced
// by route.contract.test.ts, consumed at runtime by mobile's cloudSyncEngine.
type ProjectDelta = import('@agiworkforce/cloud-contracts').ProjectWireDelta;

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

async function handlePull(request: NextRequest, url: URL) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const sinceRaw = url.searchParams.get('since') ?? '0';
  const parsedSince = ServerVersionSchema.safeParse(sinceRaw);
  if (!parsedSince.success) {
    throw createError.validation('Invalid projects sync cursor', parsedSince.error);
  }
  const since = parsedSince.data;

  try {
    const projects = await db.query<ProjectDelta>(
      `
        select id, name, description, instructions, color, is_archived, metadata,
               created_at, updated_at, deleted_at, server_version
        from user_projects
        where user_id = $1
          and organization_id is not distinct from $3::uuid
          and server_version > $2
        order by server_version asc
        limit ${MAX_PROJECTS_PULL}
      `,
      [userId, since, organizationId],
    );

    const saturated = projects.length >= MAX_PROJECTS_PULL;
    const cursor = computeProjectsPullCursor(since, projects);
    return NextResponse.json({ projects, cursor, hasMore: saturated });
  } catch (error) {
    logger.error({ error, userId }, 'Projects sync pull failed');
    throw createError.internal('Failed to pull project changes');
  }
}

async function handleGet(request: NextRequest) {
  const url = new URL(request.url);
  return handlePull(request, url);
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

async function handlePost(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }
  const parsed = ProjectsSyncPushRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid projects sync payload', parsed.error);
  }
  const { projects = [] } = parsed.data;

  if (projects.length === 0) {
    return NextResponse.json({ applied: [], conflicts: [], cursor: '0' });
  }

  const subscription = await SubscriptionService.getSubscription(db, userId);
  const planTier = subscription?.plan_tier;
  const projectLimit = getProjectLimit(planTier);
  if (projectLimit === 0) {
    throw createError.validation(getProjectLimitErrorMessage(planTier));
  }

  const applied: Array<{ id: string; server_version: string }> = [];
  const conflicts: Array<{ id: string; current: ProjectDelta | null }> = [];
  try {
    const rows = await db.query<{
      kind: 'applied' | 'conflict';
      id: string;
      server_version: string | null;
      current: ProjectDelta | null;
    }>(
      `
        with input as materialized (
          select (item ->> 'id')::uuid as id,
                 item ->> 'name' as name,
                 item ->> 'description' as description,
                 item ->> 'instructions' as instructions,
                 item ->> 'color' as color,
                 coalesce((item ->> 'isArchived')::boolean, false) as is_archived,
                 case when item ? 'metadata' then item -> 'metadata' else 'null'::jsonb end
                   as metadata,
                 (item ->> 'baseVersion')::bigint as base_version,
                 nullif(item ->> 'deletedAt', '') is not null as should_delete
            from jsonb_array_elements($2::jsonb) as source(item)
        ), updated as (
          update user_projects as existing
             set name = incoming.name,
                 description = incoming.description,
                 instructions = incoming.instructions,
                 color = incoming.color,
                 is_archived = incoming.is_archived,
                 metadata = incoming.metadata,
                 updated_at = now(),
                 deleted_at = case when incoming.should_delete then now() else null end
            from input as incoming
           where existing.id = incoming.id
             and existing.user_id = $1
             and existing.organization_id is not distinct from $4::uuid
             and existing.server_version = incoming.base_version
          returning existing.id, existing.server_version
        ), inserted as (
          insert into user_projects
            (id, user_id, organization_id, name, description, instructions, color, is_archived, metadata,
             created_at, updated_at, deleted_at)
          select incoming.id, $1, $4, incoming.name, incoming.description, incoming.instructions,
                 incoming.color, incoming.is_archived, incoming.metadata, now(), now(),
                 case when incoming.should_delete then now() else null end
            from input as incoming
           where incoming.base_version = 0
          on conflict (id) do nothing
          returning id, server_version
        ), applied_rows as materialized (
          select id, server_version from updated
          union all
          select id, server_version from inserted
        ), quota_guard as materialized (
          select public.assert_user_resource_limit(
                 'projects',
                 $1,
                   case when dependency.inserted_count > 0 then $3 else null end
                 )
            from (select count(*) as inserted_count from inserted) as dependency
        ), conflict_rows as (
          select incoming.id,
                 case when current.id is null then null else jsonb_build_object(
                   'id', current.id::text,
                   'name', current.name,
                   'description', current.description,
                   'instructions', current.instructions,
                   'color', current.color,
                   'is_archived', current.is_archived,
                   'metadata', current.metadata,
                   'created_at', current.created_at,
                   'updated_at', current.updated_at,
                   'deleted_at', current.deleted_at,
                   'server_version', current.server_version::text
                 ) end as current
            from input as incoming
            left join user_projects as current
              on current.id = incoming.id
             and current.user_id = $1
             and current.organization_id is not distinct from $4::uuid
           where not exists (
             select 1 from applied_rows where applied_rows.id = incoming.id
           )
        )
        select 'applied'::text as kind,
               applied_rows.id::text as id,
               applied_rows.server_version::text as server_version,
               null::jsonb as current
          from applied_rows
          cross join quota_guard
        union all
        select 'conflict'::text as kind,
               conflict_rows.id::text as id,
               null::text as server_version,
               conflict_rows.current
          from conflict_rows
          cross join quota_guard
      `,
      [userId, JSON.stringify(projects), projectLimit, organizationId],
    );

    for (const row of rows) {
      if (row.kind === 'applied' && row.server_version !== null) {
        applied.push({ id: row.id, server_version: row.server_version });
      } else if (row.kind === 'conflict') {
        conflicts.push({ id: row.id, current: row.current });
      } else {
        throw new Error('Projects sync database returned an invalid batch result');
      }
    }

    const conflictRows = conflicts.flatMap((conflict) =>
      conflict.current ? [conflict.current] : [],
    );
    const cursor = maxServerVersion('0', applied, conflictRows);
    return NextResponse.json({ applied, conflicts, cursor });
  } catch (error) {
    if (isUserResourceLimitError(error)) {
      throw createError.validation(getProjectLimitErrorMessage(planTier));
    }
    logger.error({ error, userId }, 'Projects sync push failed');
    throw createError.internal('Failed to push project changes');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * SAFE next pull cursor for the single-table projects delta. Single table → the
 * cursor is the highest delivered server_version (last element; rows arrive ordered
 * asc). bigint compare vs `since` so a digit-length boundary can't regress the
 * cursor; empty page → no progress. Exported for unit testing.
 */
export function computeProjectsPullCursor(
  since: string,
  projects: Array<{ server_version: string }>,
): string {
  if (projects.length === 0) return since;
  const frontier = projects[projects.length - 1]!.server_version;
  return bigintGreater(frontier, since) ? frontier : since;
}

/** Max of a set of bigint-as-string server_versions. */
function maxServerVersion(
  base: string,
  ...lists: Array<Array<{ server_version: string }>>
): string {
  let max = base;
  for (const list of lists) {
    for (const row of list) {
      if (bigintGreater(row.server_version, max)) max = row.server_version;
    }
  }
  return max;
}

/** Compare two non-negative integer strings without precision loss. */
function bigintGreater(a: string, b: string): boolean {
  const na = a.replace(/^0+/, '') || '0';
  const nb = b.replace(/^0+/, '') || '0';
  if (na.length !== nb.length) return na.length > nb.length;
  return na > nb;
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
