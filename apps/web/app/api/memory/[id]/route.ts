import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { UserMemoryRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

type RouteContext = { params: Promise<{ id: string }> };

type MemoryRow = UserMemoryRow & { pinned: boolean };

function serializeMemory(row: MemoryRow) {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    source: row.source,
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function handleGetMemory(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  const [data] = await db.query<MemoryRow>(
    `select id, content, category, source, pinned, created_at, updated_at
     from user_memories
     where id = $1 and user_id = $2 and is_deleted = false
     limit 1`,
    [id, userId],
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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  let body: { content?: string; pinned?: boolean };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (body.pinned !== undefined && typeof body.pinned !== 'boolean') {
    throw createError.validation('pinned must be a boolean');
  }

  const togglesPin = typeof body.pinned === 'boolean';
  const editsContent = body.content !== undefined || !togglesPin;

  const assignments: string[] = [];
  const params: unknown[] = [];

  if (editsContent) {
    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      throw createError.validation('Content is required');
    }
    if (body.content.length > 10_000) {
      throw createError.validation('Content must be 10,000 characters or less');
    }
    params.push(body.content.trim());
    assignments.push(`content = $${params.length}`);
  }

  if (togglesPin) {
    params.push(body.pinned);
    assignments.push(`pinned = $${params.length}`);
  }

  params.push(id, userId);

  const [data] = await db.query<MemoryRow>(
    `update user_memories
     set ${assignments.join(', ')}, updated_at = now()
     where id = $${params.length - 1} and user_id = $${params.length} and is_deleted = false
     returning id, content, category, source, pinned, created_at, updated_at`,
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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  try {
    await db.execute(
      `update user_memories
       set is_deleted = true, updated_at = now()
       where id = $1 and user_id = $2 and is_deleted = false`,
      [id, userId],
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
