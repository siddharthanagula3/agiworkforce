import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { UserMemoryRow } from '@/lib/server/neon-types';
import {
  MANAGED_MEMORY_MAX_PAGE_SIZE,
  readManagedMemoryCreateRequest,
  type ManagedMemoryDeleteAllResponse,
  type ManagedMemoryListResponse,
  type ManagedMemoryWriteResponse,
} from '@agiworkforce/types';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { assertMemoryWriteAllowed } from '@/lib/services/memory-write-service';
import {
  DELETED_MEMORY_ASSIGNMENTS,
  MemoryIneligibleError,
  activeMemoryPredicate,
  parseMemoryExpiry,
  workspaceMemoryPredicate,
  writeConsolidatedMemory,
  type ConsolidatedMemoryRow,
} from '@/lib/services/managed-memory-context-service';

type MemoryRow = UserMemoryRow & {
  pinned: boolean;
  project_id?: string | null;
  project_name?: string | null;
  expires_at?: string | null;
  source_conversation_id?: string | null;
  source_conversation_title?: string | null;
};

async function handleGetMemories(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const parsedOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.max(
    1,
    Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, MANAGED_MEMORY_MAX_PAGE_SIZE),
  );
  const offset = Math.min(Math.max(Number.isNaN(parsedOffset) ? 0 : parsedOffset, 0), 10_000);

  let rows: MemoryRow[];
  try {
    rows = await db.query<MemoryRow>(
      `select m.id, m.content, m.category, m.source, m.pinned, m.expires_at,
              m.created_at, m.updated_at,
              to_jsonb(m)->>'project_id' as project_id,
              p.name as project_name,
              c.id::text as source_conversation_id,
              c.title as source_conversation_title
       from user_memories m
       left join user_projects p
         on p.id::text = to_jsonb(m)->>'project_id'
        and p.deleted_at is null
       left join web_conversations c
         on c.id::text = to_jsonb(m)->>'source_conversation_id'
        and c.user_id = m.user_id
        and c.deleted_at is null
        and coalesce(c.is_temporary, false) = false
       where m.user_id = $1 and ${activeMemoryPredicate('m.')}
         and ${workspaceMemoryPredicate(4, 'm.')}
       order by m.pinned desc, m.updated_at desc
       limit $2 offset $3`,
      [userId, limit + 1, offset, organizationId ?? null],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch memories');
    throw createError.internal('Failed to fetch memories');
  }
  const data = rows.slice(0, limit);

  return NextResponse.json({
    hasMore: rows.length > limit,
    memories: data.map((m) => ({
      id: m.id,
      content: m.content,
      category: m.category,
      source: m.source,
      pinned: m.pinned,
      // Null = global. A fact confined to a project must be labelled, or it
      // reads as applying everywhere when it does not.
      projectId: m.project_id ?? null,
      projectName: m.project_name ?? null,
      sourceConversationId: m.source_conversation_id ?? null,
      sourceConversationTitle: m.source_conversation_title ?? null,
      expiresAt: m.expires_at ?? null,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
  } satisfies ManagedMemoryListResponse);
}

async function handleCreateMemory(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const read = readManagedMemoryCreateRequest(rawBody);
  if (!read.ok) throw createError.validation(read.message);
  const body = read.request;

  const expiry = parseMemoryExpiry(body.expiresAt);
  if (!expiry.ok) {
    throw createError.validation(expiry.message);
  }

  let projectId: string | null = null;
  if (body.projectId) {
    const [project] = await db.query<{ id: string }>(
      `select id from user_projects
        where id = $1::uuid and user_id = $2 and deleted_at is null
          and organization_id is not distinct from $3::uuid
        limit 1`,
      [body.projectId, userId, organizationId ?? null],
    );
    if (!project) throw createError.notFound('Project not found');
    projectId = project.id;
  }

  const source = body.source ?? 'web';

  const content = body.content.trim();
  await assertMemoryWriteAllowed(db, { userId, content });

  let row: ConsolidatedMemoryRow;
  try {
    const written = await writeConsolidatedMemory(db, {
      userId,
      content,
      category: body.category?.trim() ?? null,
      source,
      pinned: body.pinned === true,
      projectId,
      organizationId: organizationId ?? null,
      expiresAt: expiry.expiresAt ?? null,
    });
    if (!written) throw new Error('No row returned');
    row = written;
  } catch (error) {
    if (error instanceof MemoryIneligibleError) {
      throw createError.forbidden(error.message).asUserSafe();
    }
    logger.error({ error, userId }, 'Failed to create memory');
    throw createError.internal('Failed to create memory');
  }

  return NextResponse.json(
    {
      memory: {
        id: row.id,
        content: row.content,
        category: row.category,
        source: row.source,
        pinned: row.pinned,
        projectId: row.project_id ?? null,
        expiresAt: row.expires_at ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      merged: row.outcome === 'merged',
      supersededIds: row.superseded_ids ?? [],
      supersededBy: row.superseded_by ?? null,
    } satisfies ManagedMemoryWriteResponse,
    { status: row.outcome === 'merged' ? 200 : 201 },
  );
}

async function handleDeleteAllMemories(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  let deleted: number;
  try {
    deleted = await db.execute(
      `update user_memories
          set ${DELETED_MEMORY_ASSIGNMENTS}
        where user_id = $1 and is_deleted = false
          and ${workspaceMemoryPredicate(2)}`,
      [userId, organizationId ?? null],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to delete memories');
    throw createError.internal('Failed to delete memories');
  }

  return NextResponse.json({ deleted } satisfies ManagedMemoryDeleteAllResponse);
}

export const GET = withCorsRoute(withErrorHandler(handleGetMemories));
export const POST = withCorsRoute(withErrorHandler(handleCreateMemory));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteAllMemories));
export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 405 });
}
