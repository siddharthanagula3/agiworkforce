/**
 * Cross-device cloud MEMORY sync — delta sync (mirrors /api/chat/sync).
 * Design: docs/plans/shared-cloud-state-2026-06-22.md
 *
 *   GET  /api/memory/sync?since=<server_version cursor>
 *        → user_memories rows with server_version > cursor (INCLUDING tombstones,
 *          i.e. is_deleted = true, so deletes propagate), scoped to the
 *          authenticated user, plus the next cursor + hasMore.
 *   GET  /api/memory/sync   (no `since`)
 *        → legacy sync STATUS { lastSync, entriesCount, sources } (back-compat for
 *          the mobile data-controls UI).
 *   POST /api/memory/sync   { protocolVersion: 2, memories: [...] }
 *        → server-version compare-and-swap. user_id is set SERVER-SIDE from the verified
 *          session (never from the body); RLS WITH CHECK is the backstop.
 *          The server owns updated_at and tombstone timestamps; stale base revisions
 *          return the deterministic current server row as a conflict.
 *   POST /api/memory/sync   (no `memories`)
 *        → legacy TRIGGER { synced, conflicts } (back-compat).
 *
 * Hardening: every path runs through getUserScopedDb (RLS-scoped: SET LOCAL ROLE
 * app_rls + bound session sub) — NOT the app-layer-only getNeonDb the placeholder
 * used. Trust boundary: managed-cloud only; Local/BYOK memories have no cloud_id and
 * are never pushed/pulled (enforced client-side per the trust-mode matrix).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  MemorySyncPushRequestSchema,
  ServerVersionSchema,
  type MemoryWireDelta,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

const MAX_MEMORIES_PULL = 1000;

// Wire shape from the shared cloud contract (restructure Wave 4) — enforced
// by route.contract.test.ts, consumed at runtime by mobile's cloudSyncEngine.
type MemoryDelta = MemoryWireDelta;

// ---------------------------------------------------------------------------
// GET — delta pull (?since=) OR legacy status (no since)
// ---------------------------------------------------------------------------

async function handleGet(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.has('since')) {
    return handlePull(request, url);
  }
  return handleStatus(request);
}

async function handlePull(request: NextRequest, url: URL) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-scoped: runs as app_rls with the session sub bound, so WITH CHECK / USING
  // policies enforce isolation (not just the user_id filter).
  const { db, userId } = await getUserScopedDb(request);

  const sinceRaw = url.searchParams.get('since') ?? '0';
  const parsedSince = ServerVersionSchema.safeParse(sinceRaw);
  if (!parsedSince.success) {
    throw createError.validation('Invalid memory sync cursor', parsedSince.error);
  }
  const since = parsedSince.data;

  try {
    const memories = await db.query<MemoryDelta>(
      `
        select id, content, category, source, pinned, is_deleted,
               created_at, updated_at, server_version
        from user_memories
        where user_id = $1 and server_version > $2
        order by server_version asc
        limit ${MAX_MEMORIES_PULL}
      `,
      [userId, since],
    );

    const saturated = memories.length >= MAX_MEMORIES_PULL;
    const cursor = computeMemoryPullCursor(since, memories);
    return NextResponse.json({ memories, cursor, hasMore: saturated });
  } catch (error) {
    logger.error({ error, userId }, 'Memory sync pull failed');
    throw createError.internal('Failed to pull memory changes');
  }
}

async function handleStatus(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);

  let allMemories: { source: string | null; updated_at: string }[];
  try {
    allMemories = await db.query<{ source: string | null; updated_at: string }>(
      `select source, updated_at
       from user_memories
       where user_id = $1 and is_deleted = false
       order by updated_at desc`,
      [userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get memory sync status');
    throw createError.internal('Failed to get sync status');
  }

  const lastSync = allMemories.length > 0 ? (allMemories[0]?.updated_at ?? null) : null;
  const sources: Record<string, number> = { mobile: 0, desktop: 0, web: 0, auto: 0 };
  for (const m of allMemories) {
    const src = m.source ?? 'web';
    if (src in sources && sources[src] !== undefined) sources[src]++;
  }

  return NextResponse.json({ lastSync, entriesCount: allMemories.length, sources });
}

// ---------------------------------------------------------------------------
// POST — delta push ({ memories }) OR legacy trigger (no memories)
// ---------------------------------------------------------------------------

async function handlePost(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // Body is optional: the legacy trigger posts no body. Parse defensively.
  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    rawBody = {};
  }
  // Legacy trigger: no `memories` key → return the simple synced count (RLS-scoped).
  if (!hasMemoriesKey(rawBody)) {
    try {
      const [row] = await db.query<{ count: number }>(
        `select count(*)::int as count from user_memories where user_id = $1 and is_deleted = false`,
        [userId],
      );
      return NextResponse.json({ synced: row?.count ?? 0, conflicts: 0 });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to trigger memory sync');
      throw createError.internal('Failed to trigger sync');
    }
  }

  if (!hasSyncProtocolV2(rawBody)) {
    return syncProtocolUpgradeRequired();
  }
  const parsed = MemorySyncPushRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid memory sync payload', parsed.error);
  }
  const { memories } = parsed.data;

  // Delta push: server-version compare-and-swap. user_id is forced to the session
  // user so a client can never write another user's row (RLS WITH CHECK is the
  // DB-level backstop). Server-owned timestamps/tombstones remove client-clock races.
  const applied: Array<{ id: string; server_version: string }> = [];
  const conflicts: Array<{ id: string; current: MemoryDelta | null }> = [];
  try {
    if (memories.length > 0) {
      const rows = await db.query<{
        kind: 'applied' | 'conflict';
        id: string;
        server_version: string | null;
        current: MemoryDelta | null;
      }>(
        `
          with input as materialized (
            select (item ->> 'id')::uuid as id,
                   item ->> 'content' as content,
                   item ->> 'category' as category,
                   item ->> 'source' as source,
                   coalesce((item ->> 'pinned')::boolean, false) as pinned,
                   item ? 'pinned' as has_pinned,
                   (item ->> 'baseVersion')::bigint as base_version,
                   coalesce((item ->> 'isDeleted')::boolean, false) as should_delete
              from jsonb_array_elements($2::jsonb) as source(item)
          ), updated as (
            update user_memories as existing
               set content = incoming.content,
                   category = incoming.category,
                   source = incoming.source,
                   pinned = case when incoming.has_pinned then incoming.pinned else existing.pinned end,
                   is_deleted = incoming.should_delete,
                   updated_at = now()
              from input as incoming
             where existing.id = incoming.id
               and existing.user_id = $1
               and existing.server_version = incoming.base_version
               and (existing.is_deleted = false or incoming.should_delete)
            returning existing.id, existing.server_version
          ), inserted as (
            insert into user_memories
              (id, user_id, content, category, source, pinned, is_deleted, created_at, updated_at)
            select incoming.id, $1, incoming.content, incoming.category, incoming.source,
                   incoming.pinned, incoming.should_delete, now(), now()
              from input as incoming
             where incoming.base_version = 0
            on conflict (id) do nothing
            returning id, server_version
          ), applied_rows as materialized (
            select id, server_version from updated union all select id, server_version from inserted
          ), conflict_rows as (
            select incoming.id,
                   case when current.id is null then null else jsonb_build_object(
                     'id', current.id::text, 'content', current.content,
                     'category', current.category, 'source', current.source,
                     'pinned', current.pinned, 'is_deleted', current.is_deleted,
                     'created_at', current.created_at, 'updated_at', current.updated_at,
                     'server_version', current.server_version::text
                   ) end as current
              from input as incoming
              left join user_memories as current
                on current.id = incoming.id and current.user_id = $1
             where not exists (select 1 from applied_rows where applied_rows.id = incoming.id)
          )
          select 'applied'::text as kind, id::text, server_version::text, null::jsonb as current
            from applied_rows
          union all
          select 'conflict'::text, id::text, null::text, current from conflict_rows
        `,
        [userId, JSON.stringify(memories)],
      );
      for (const row of rows) {
        if (row.kind === 'applied' && row.server_version !== null) {
          applied.push({ id: row.id, server_version: row.server_version });
        } else if (row.kind === 'conflict') {
          conflicts.push({ id: row.id, current: row.current });
        } else {
          throw new Error('Memory sync database returned an invalid batch result');
        }
      }
    }

    const conflictRows = conflicts.flatMap((conflict) =>
      conflict.current ? [conflict.current] : [],
    );
    const cursor = maxServerVersion('0', applied, conflictRows);
    return NextResponse.json({ protocolVersion: 2, applied, conflicts, cursor });
  } catch (error) {
    logger.error({ error, userId }, 'Memory sync push failed');
    throw createError.internal('Failed to push memory changes');
  }
}

function hasMemoriesKey(value: unknown): boolean {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value) && 'memories' in value,
  );
}

function hasSyncProtocolV2(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)['protocolVersion'] === 2,
  );
}

function syncProtocolUpgradeRequired(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'SYNC_PROTOCOL_UPGRADE_REQUIRED',
        message: 'Upgrade this client before pushing Managed Cloud memory changes.',
      },
      requiredProtocolVersion: 2,
    },
    { status: 409 },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the SAFE next pull cursor for the single-table memory delta.
 *
 * Unlike the chat endpoint (conversations + messages paginate independently and
 * share one sequence, so a lagging table can hide in-gap rows), memory is ONE table:
 * every row with `server_version > since` up to the delivered frontier was returned
 * in order. So the safe cursor is simply the highest delivered version (the last
 * element, since rows are ordered `by server_version asc`). When the page saturates,
 * `hasMore` tells the client to pull again from this cursor; the re-request is
 * UPSERTed idempotently. Empty page → no progress (stay at `since`).
 *
 * Exported for direct unit testing.
 */
export function computeMemoryPullCursor(
  since: string,
  memories: Array<{ server_version: string }>,
): string {
  if (memories.length === 0) return since;
  const frontier = memories[memories.length - 1]!.server_version;
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
