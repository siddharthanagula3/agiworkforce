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

type MemoryRow = UserMemoryRow & {
  pinned: boolean;
  project_id?: string | null;
  project_name?: string | null;
};

async function handleGetMemories(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const parsedOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 100));
  const offset = Math.min(Math.max(Number.isNaN(parsedOffset) ? 0 : parsedOffset, 0), 10_000);

  let data: MemoryRow[];
  try {
    data = await db.query<MemoryRow>(
      `select m.id, m.content, m.category, m.source, m.pinned, m.created_at, m.updated_at,
              to_jsonb(m)->>'project_id' as project_id,
              p.name as project_name
       from user_memories m
       left join user_projects p on p.id::text = to_jsonb(m)->>'project_id'
       where m.user_id = $1 and m.is_deleted = false
       order by m.pinned desc, m.updated_at desc
       limit $2 offset $3`,
      [userId, limit, offset],
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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  let body: { content?: string; category?: string; source?: string; pinned?: boolean };
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

  const validSources = ['mobile', 'desktop', 'web', 'auto'];
  const source = validSources.includes(body.source ?? '') ? body.source : 'web';

  let row: MemoryRow;
  try {
    const [inserted] = await db.query<MemoryRow>(
      `insert into user_memories (user_id, content, category, source, pinned)
       values ($1, $2, $3, $4, $5)
       returning id, content, category, source, pinned, created_at, updated_at`,
      [userId, body.content.trim(), body.category?.trim() ?? null, source, body.pinned === true],
    );
    if (!inserted) throw new Error('No row returned');
    row = inserted;
  } catch (error) {
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
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    },
    { status: 201 },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGetMemories));
export const POST = withCorsRoute(withErrorHandler(handleCreateMemory));
export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 405 });
}
