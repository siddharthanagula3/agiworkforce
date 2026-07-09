/**
 * Cross-device cloud PROJECTS sync — delta sync (mirrors /api/chat/sync + /api/memory/sync).
 * Design: docs/plans/shared-cloud-state-2026-06-22.md
 *
 *   GET  /api/projects/sync?since=<server_version cursor>
 *        → user_projects rows with server_version > cursor (INCLUDING tombstones,
 *          deleted_at IS NOT NULL, so deletes propagate), scoped to the
 *          authenticated user, plus the next cursor + hasMore.
 *   POST /api/projects/sync  { projects: [...] }
 *        → idempotent UPSERT by id. user_id set SERVER-SIDE from the verified
 *          session (never the body); RLS WITH CHECK is the backstop. Last-writer-
 *          wins by updated_at; a null/older updated_at can never clobber a newer
 *          row. deleted_at carries the tombstone.
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
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';

const MAX_PROJECTS_PULL = 500;
const MAX_PROJECTS_PUSH = 500;

// Wire shape from the shared cloud contract (restructure Wave 4) — enforced
// by route.contract.test.ts, consumed at runtime by mobile's cloudSyncEngine.
type ProjectDelta = import('@agiworkforce/services').ProjectWireDelta;

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

async function handlePull(request: NextRequest, url: URL) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);

  const sinceRaw = url.searchParams.get('since') ?? '0';
  const since = /^\d{1,19}$/.test(sinceRaw) ? sinceRaw : '0';

  try {
    const projects = await db.query<ProjectDelta>(
      `
        select id, name, description, instructions, color, is_archived, metadata,
               created_at, updated_at, deleted_at, server_version
        from user_projects
        where user_id = $1 and server_version > $2
        order by server_version asc
        limit ${MAX_PROJECTS_PULL}
      `,
      [userId, since],
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

const PushProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  description: z.string().max(2_000).nullable().optional(),
  instructions: z.string().max(10_000).nullable().optional(),
  color: z.string().max(50).nullable().optional(),
  isArchived: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
});

const PushBodySchema = z.object({
  projects: z.array(PushProjectSchema).max(MAX_PROJECTS_PUSH).optional(),
});

async function handlePost(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }
  const parsed = PushBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid projects sync payload', parsed.error);
  }
  const { projects = [] } = parsed.data;

  const applied: Array<{ id: string; server_version: string }> = [];
  try {
    for (const p of projects) {
      const rows = await db.query<{ id: string; server_version: string }>(
        `
          insert into user_projects
            (id, user_id, name, description, instructions, color, is_archived, metadata,
             created_at, updated_at, deleted_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb,
                  coalesce($9::timestamptz, now()), $10::timestamptz, $11::timestamptz)
          on conflict (id) do update set
            name = excluded.name,
            description = excluded.description,
            instructions = excluded.instructions,
            color = excluded.color,
            is_archived = excluded.is_archived,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
          where user_projects.user_id = $2
            and excluded.updated_at >= user_projects.updated_at
          returning id, server_version
        `,
        [
          p.id,
          userId,
          p.name,
          p.description ?? null,
          p.instructions ?? null,
          p.color ?? null,
          p.isArchived ?? false,
          JSON.stringify(p.metadata ?? null),
          p.createdAt ?? null,
          p.updatedAt,
          p.deletedAt ?? null,
        ],
      );
      if (rows[0]) applied.push(rows[0]);
    }

    const cursor = maxServerVersion('0', applied);
    return NextResponse.json({ applied, cursor });
  } catch (error) {
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

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
