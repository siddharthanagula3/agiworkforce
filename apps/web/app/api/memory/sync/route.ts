import { NextRequest, NextResponse } from 'next/server';
import {
  MemorySyncPushRequestSchema,
  SYNC_PROTOCOL_VERSION,
  ServerVersionSchema,
  resolveSyncProtocolVersion,
  syncProtocolRefusalMessage,
  type MemoryWireDelta,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { partitionMemoryWrites } from '@/lib/services/memory-write-service';
import {
  loadMemoryWritePolicies,
  memoryWriteAdmission,
} from '@/lib/services/managed-memory-context-service';
import {
  activeMemoryPredicate,
  workspaceMemoryPredicate,
} from '@/lib/services/managed-memory-context-service';

const MAX_MEMORIES_PULL = 1000;

type MemoryDelta = MemoryWireDelta;

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

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const sinceRaw = url.searchParams.get('since') ?? '0';
  const parsedSince = ServerVersionSchema.safeParse(sinceRaw);
  if (!parsedSince.success) {
    throw createError.validation('Invalid memory sync cursor', parsedSince.error);
  }
  const since = parsedSince.data;

  try {
    const memories = await db.query<MemoryDelta>(
      `
        select id, content, category, source, pinned,
               not (${activeMemoryPredicate()}) as is_deleted,
               created_at, updated_at, server_version
        from user_memories
        where user_id = $1 and server_version > $2 and ${workspaceMemoryPredicate(3)}
        order by server_version asc
        limit ${MAX_MEMORIES_PULL}
      `,
      [userId, since, organizationId ?? null],
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

  const { db, userId, organizationId } = await getUserScopedDb(request);

  let allMemories: { source: string | null; updated_at: string }[];
  try {
    allMemories = await db.query<{ source: string | null; updated_at: string }>(
      `select source, updated_at
       from user_memories
       where user_id = $1 and ${activeMemoryPredicate()} and ${workspaceMemoryPredicate(2)}
       order by updated_at desc`,
      [userId, organizationId ?? null],
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

async function handlePost(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    rawBody = {};
  }
  if (!hasMemoriesKey(rawBody)) {
    try {
      const [row] = await db.query<{ count: number }>(
        `select count(*)::int as count from user_memories
          where user_id = $1 and ${activeMemoryPredicate()} and ${workspaceMemoryPredicate(2)}`,
        [userId, organizationId ?? null],
      );
      return NextResponse.json({ synced: row?.count ?? 0, conflicts: 0 });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to trigger memory sync');
      throw createError.internal('Failed to trigger sync');
    }
  }

  assertReadableSyncProtocol(rawBody);
  const parsed = MemorySyncPushRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid memory sync payload', parsed.error);
  }
  const { memories } = parsed.data;

  const { allowed, rejected } = await partitionMemoryWrites(db, {
    userId,
    candidates: memories,
    contentOf: (memory) => (memory.isDeleted === true ? '' : memory.content),
  });
  const refused = rejected.map(({ candidate, term }) => ({ id: candidate.id, term }));

  // A push carrying new text is a memory write and passes the same gate the web
  // surface does. A push that only deletes is how a client obeys a switch that
  // was turned off, so it is never blocked here.
  const policies = await loadMemoryWritePolicies(db, { userId, organizationId });
  const blocked: Array<{ id: string; reason: string }> = [];
  const admitted = [];
  for (const memory of allowed) {
    if (memory.isDeleted === true) {
      admitted.push(memory);
      continue;
    }
    const decision = await memoryWriteAdmission(
      db,
      {
        userId,
        content: memory.content,
        category: memory.category ?? null,
        source: memory.source ?? 'web',
        organizationId: organizationId ?? null,
      },
      { policies },
    );
    if (decision.eligible) admitted.push(memory);
    else blocked.push({ id: memory.id, reason: decision.reason });
  }

  const applied: Array<{ id: string; server_version: string }> = [];
  const conflicts: Array<{ id: string; current: MemoryDelta | null }> = [];
  try {
    if (admitted.length > 0) {
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
               and ${workspaceMemoryPredicate(3, 'existing.')}
               and existing.server_version = incoming.base_version
               and (existing.is_deleted = false or incoming.should_delete)
            returning existing.id, existing.server_version
          ), inserted as (
            insert into user_memories
              (id, user_id, content, category, source, pinned, is_deleted, organization_id,
               created_at, updated_at)
            select incoming.id, $1, incoming.content, incoming.category, incoming.source,
                   incoming.pinned, incoming.should_delete, $3::uuid, now(), now()
              from input as incoming
             where incoming.base_version = 0
            on conflict (user_id, id) do nothing
            returning id, server_version
          ), applied_rows as materialized (
            select id, server_version from updated union all select id, server_version from inserted
          ), conflict_rows as (
            select incoming.id,
                   case when current.id is null then null else jsonb_build_object(
                     'id', current.id::text, 'content', current.content,
                     'category', current.category, 'source', current.source,
                     'pinned', current.pinned, 'is_deleted', not (${activeMemoryPredicate('current.')}),
                     'created_at', current.created_at, 'updated_at', current.updated_at,
                     'server_version', current.server_version::text
                   ) end as current
              from input as incoming
              left join user_memories as current
                on current.id = incoming.id and current.user_id = $1
               and ${workspaceMemoryPredicate(3, 'current.')}
             where not exists (select 1 from applied_rows where applied_rows.id = incoming.id)
          )
          select 'applied'::text as kind, id::text, server_version::text, null::jsonb as current
            from applied_rows
          union all
          select 'conflict'::text, id::text, null::text, current from conflict_rows
        `,
        [userId, JSON.stringify(admitted), organizationId ?? null],
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
    return NextResponse.json({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      applied,
      conflicts,
      rejected: refused,
      cursor,
    });
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

/**
 * The floor the shared contract defines, applied before the batch is parsed so
 * a caller below it reads a sentence naming the remedy rather than a list of
 * fields it has never heard of.
 */
function assertReadableSyncProtocol(value: unknown): void {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const decision = resolveSyncProtocolVersion((body as Record<string, unknown>)['protocolVersion']);
  if (decision.compatibility === 'readable') return;
  const message = syncProtocolRefusalMessage(decision, 'memory sync');
  if (decision.compatibility === 'too_new') throw createError.validation(message);
  throw createError.clientUpdateRequired(message);
}

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
