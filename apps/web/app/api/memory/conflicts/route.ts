import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  activeMemoryPredicate,
  unexpiredMemoryPredicate,
  workspaceMemoryPredicate,
} from '@/lib/services/managed-memory-context-service';

const MAX_CONFLICTS = 50;

interface MemoryConflictRow {
  id: string;
  content: string;
  replaced_at: string | null;
  kept_id: string;
  kept_content: string;
  kept_pinned: boolean;
  kept_source: string | null;
}

async function handleListConflicts(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  let rows: MemoryConflictRow[];
  try {
    rows = await db.query<MemoryConflictRow>(
      `select replaced.id::text as id, replaced.content, replaced.superseded_at as replaced_at,
              kept.id::text as kept_id, kept.content as kept_content,
              kept.pinned as kept_pinned, kept.source as kept_source
         from user_memories replaced
         join user_memories kept
           on kept.id = replaced.superseded_by and kept.user_id = replaced.user_id
        where replaced.user_id = $1
          and replaced.superseded_by is not null
          and ${unexpiredMemoryPredicate('replaced.')}
          and ${activeMemoryPredicate('kept.')}
          and ${workspaceMemoryPredicate(2, 'replaced.')}
        order by replaced.superseded_at desc nulls last
        limit ${MAX_CONFLICTS}`,
      [userId, organizationId ?? null],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to list memory conflicts');
    throw createError.internal('Failed to list memory conflicts');
  }

  return NextResponse.json({
    conflicts: rows.map((row) => ({
      id: row.id,
      content: row.content,
      replacedAt: row.replaced_at,
      kept: {
        id: row.kept_id,
        content: row.kept_content,
        pinned: row.kept_pinned,
        source: row.kept_source,
      },
    })),
  });
}

export const GET = withCorsRoute(withErrorHandler(handleListConflicts));

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 405 });
}
