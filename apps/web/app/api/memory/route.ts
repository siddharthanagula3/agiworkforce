import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { UserMemoryRow } from '@/lib/server/neon-types';

const MAX_MEMORY_CATEGORY_CHARS = 200;
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { assertMemoryWriteAllowed } from '@/lib/services/memory-write-service';
import {
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
};

async function handleGetMemories(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const parsedOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 100));
  const offset = Math.min(Math.max(Number.isNaN(parsedOffset) ? 0 : parsedOffset, 0), 10_000);

  let data: MemoryRow[];
  try {
    data = await db.query<MemoryRow>(
      `select m.id, m.content, m.category, m.source, m.pinned, m.expires_at,
              m.created_at, m.updated_at,
              to_jsonb(m)->>'project_id' as project_id,
              p.name as project_name
       from user_memories m
       left join user_projects p
         on p.id::text = to_jsonb(m)->>'project_id'
        and p.deleted_at is null
       where m.user_id = $1 and ${activeMemoryPredicate('m.')}
         and ${workspaceMemoryPredicate(4, 'm.')}
       order by m.pinned desc, m.updated_at desc
       limit $2 offset $3`,
      [userId, limit, offset, organizationId ?? null],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch memories');
    throw createError.internal('Failed to fetch memories');
  }

  return NextResponse.json({
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
      expiresAt: m.expires_at ?? null,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
  });
}

async function handleCreateMemory(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  let body: {
    content?: string;
    category?: string;
    source?: string;
    pinned?: boolean;
    expiresAt?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
    throw createError.validation('Content is required');
  }

  if (body.content.length > 10_000) {
    throw createError.validation('Content must be 10,000 characters or less');
  }

  if (body.pinned !== undefined && typeof body.pinned !== 'boolean') {
    throw createError.validation('pinned must be a boolean');
  }

  // The category is injected verbatim into the memory context a later turn
  // sends to the model, so it is bounded and typed here rather than accepted as
  // whatever the caller sent.
  if (body.category !== undefined && body.category !== null) {
    if (typeof body.category !== 'string') {
      throw createError.validation('category must be a string');
    }
    if (body.category.trim().length > MAX_MEMORY_CATEGORY_CHARS) {
      throw createError.validation(
        `category must be ${MAX_MEMORY_CATEGORY_CHARS} characters or less`,
      );
    }
  }

  const expiry = parseMemoryExpiry(body.expiresAt);
  if (!expiry.ok) {
    throw createError.validation(expiry.message);
  }

  const validSources = ['mobile', 'desktop', 'web', 'auto'];
  const source = validSources.includes(body.source ?? '') ? body.source : 'web';

  const content = body.content.trim();
  await assertMemoryWriteAllowed(db, { userId, content });

  let row: ConsolidatedMemoryRow;
  try {
    const written = await writeConsolidatedMemory(db, {
      userId,
      content,
      category: body.category?.trim() ?? null,
      source: source ?? 'web',
      pinned: body.pinned === true,
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
        expiresAt: row.expires_at ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      merged: row.outcome === 'merged',
      supersededIds: row.superseded_ids ?? [],
      supersededBy: row.superseded_by ?? null,
    },
    { status: row.outcome === 'merged' ? 200 : 201 },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGetMemories));
export const POST = withCorsRoute(withErrorHandler(handleCreateMemory));
export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 405 });
}
