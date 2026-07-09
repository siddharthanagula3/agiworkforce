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
 *   POST /api/memory/sync   { memories: [...] }
 *        → idempotent UPSERT by id. user_id is set SERVER-SIDE from the verified
 *          session (never from the body); RLS WITH CHECK is the backstop.
 *          Last-writer-wins by updated_at; a null/older updated_at can never clobber
 *          a newer row. is_deleted carries the tombstone.
 *   POST /api/memory/sync   (no `memories`)
 *        → legacy TRIGGER { synced, conflicts } (back-compat).
 *
 * Hardening: every path runs through getUserScopedDb (RLS-scoped: SET LOCAL ROLE
 * app_rls + bound session sub) — NOT the app-layer-only getNeonDb the placeholder
 * used. Trust boundary: managed-cloud only; Local/BYOK memories have no cloud_id and
 * are never pushed/pulled (enforced client-side per the trust-mode matrix).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';

const MAX_MEMORIES_PULL = 1000;
const MAX_MEMORIES_PUSH = 1000;

// Wire shape from the shared cloud contract (restructure Wave 4) — enforced
// by route.contract.test.ts, consumed at runtime by mobile's cloudSyncEngine.
type MemoryDelta = import('@agiworkforce/services').MemoryWireDelta;

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
  const since = /^\d{1,19}$/.test(sinceRaw) ? sinceRaw : '0';

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

const PushMemorySchema = z.object({
  id: z.string().uuid(),
  content: z.string().max(20_000),
  category: z.string().max(200).nullable().optional(),
  source: z.string().max(50).nullable().optional(),
  pinned: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
});

const PushBodySchema = z.object({
  memories: z.array(PushMemorySchema).max(MAX_MEMORIES_PUSH).optional(),
});

async function handlePost(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);

  // Body is optional: the legacy trigger posts no body. Parse defensively.
  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    rawBody = {};
  }
  const parsed = PushBodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw createError.validation('Invalid memory sync payload', parsed.error);
  }
  const memories = parsed.data.memories;

  // Legacy trigger: no `memories` key → return the simple synced count (RLS-scoped).
  if (memories === undefined) {
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

  // Delta push: idempotent UPSERT by id, last-writer-wins by updated_at. user_id is
  // forced to the session user so a client can never write another user's row (RLS
  // WITH CHECK is the DB-level backstop). A null/older updated_at can never clobber a
  // newer row. is_deleted carries the tombstone so deletes propagate cross-device.
  const applied: Array<{ id: string; server_version: string }> = [];
  try {
    for (const m of memories) {
      const rows = await db.query<{ id: string; server_version: string }>(
        `
          insert into user_memories
            (id, user_id, content, category, source, pinned, is_deleted, created_at, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), $9::timestamptz)
          on conflict (id) do update set
            content = excluded.content,
            category = excluded.category,
            source = excluded.source,
            pinned = excluded.pinned,
            is_deleted = excluded.is_deleted,
            updated_at = excluded.updated_at
          where user_memories.user_id = $2
            and excluded.updated_at >= user_memories.updated_at
          returning id, server_version
        `,
        [
          m.id,
          userId,
          m.content,
          m.category ?? null,
          m.source ?? null,
          m.pinned ?? false,
          m.isDeleted ?? false,
          m.createdAt ?? null,
          m.updatedAt,
        ],
      );
      if (rows[0]) applied.push(rows[0]);
    }

    const cursor = maxServerVersion('0', applied);
    return NextResponse.json({ applied, cursor });
  } catch (error) {
    logger.error({ error, userId }, 'Memory sync push failed');
    throw createError.internal('Failed to push memory changes');
  }
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

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
