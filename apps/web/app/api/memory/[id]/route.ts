import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { UserMemoryRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { assertMemoryWriteAllowed } from '@/lib/services/memory-write-service';
import {
  parseMemoryExpiry,
  unexpiredMemoryPredicate,
  workspaceMemoryPredicate,
} from '@/lib/services/managed-memory-context-service';

type RouteContext = { params: Promise<{ id: string }> };

type MemoryRow = UserMemoryRow & {
  pinned: boolean;
  expires_at?: string | null;
  superseded_by?: string | null;
};

const MEMORY_COLUMNS =
  'id, content, category, source, pinned, expires_at, superseded_by, created_at, updated_at';

function serializeMemory(row: MemoryRow) {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    source: row.source,
    pinned: row.pinned,
    expiresAt: row.expires_at ?? null,
    supersededBy: row.superseded_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function handleGetMemory(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id } = await context.params;

  const [data] = await db.query<MemoryRow>(
    `select ${MEMORY_COLUMNS}
     from user_memories
     where id = $1 and user_id = $2 and ${unexpiredMemoryPredicate()}
       and ${workspaceMemoryPredicate(3)}
     limit 1`,
    [id, userId, organizationId ?? null],
  );

  if (!data) {
    throw createError.notFound('Memory not found');
  }

  return NextResponse.json({ memory: serializeMemory(data) });
}

async function handleUpdateMemory(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id } = await context.params;

  let body: { content?: string; pinned?: boolean; expiresAt?: unknown };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (body.pinned !== undefined && typeof body.pinned !== 'boolean') {
    throw createError.validation('pinned must be a boolean');
  }

  const expiry = parseMemoryExpiry(body.expiresAt);
  if (!expiry.ok) {
    throw createError.validation(expiry.message);
  }

  const togglesPin = typeof body.pinned === 'boolean';
  const setsExpiry = expiry.expiresAt !== undefined;
  const editsContent = body.content !== undefined || (!togglesPin && !setsExpiry);

  const assignments: string[] = [];
  const params: unknown[] = [];

  if (editsContent) {
    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      throw createError.validation('Content is required');
    }
    if (body.content.length > 10_000) {
      throw createError.validation('Content must be 10,000 characters or less');
    }
    const content = body.content.trim();
    await assertMemoryWriteAllowed(db, { userId, content });
    params.push(content);
    assignments.push(`content = $${params.length}`);
  }

  if (togglesPin) {
    params.push(body.pinned);
    assignments.push(`pinned = $${params.length}`);
  }

  if (setsExpiry) {
    params.push(expiry.expiresAt);
    assignments.push(`expires_at = $${params.length}::timestamptz`);
  }

  params.push(id, userId, organizationId ?? null);

  const [data] = await db.query<MemoryRow>(
    `update user_memories
     set ${assignments.join(', ')}, updated_at = now()
     where id = $${params.length - 2} and user_id = $${params.length - 1}
       and ${unexpiredMemoryPredicate()} and ${workspaceMemoryPredicate(params.length)}
     returning ${MEMORY_COLUMNS}`,
    params,
  );

  if (!data) {
    throw createError.notFound('Memory not found');
  }

  return NextResponse.json({ memory: serializeMemory(data) });
}

async function handleDeleteMemory(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id } = await context.params;

  try {
    await db.execute(
      `update user_memories
       set is_deleted = true, updated_at = now()
       where id = $1 and user_id = $2 and is_deleted = false
         and ${workspaceMemoryPredicate(3)}`,
      [id, userId, organizationId ?? null],
    );
  } catch (error) {
    logger.error({ error, memoryId: id }, 'Failed to delete memory');
    throw createError.internal('Failed to delete memory');
  }

  return NextResponse.json({ success: true });
}

export const GET = withCorsRoute(withErrorHandler(handleGetMemory));
export const PUT = withCorsRoute(withErrorHandler(handleUpdateMemory));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteMemory));
export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 405 });
}
