import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { ManagedMemoryRestoreResponse } from '@agiworkforce/types';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { assertMemoryWriteAllowed } from '@/lib/services/memory-write-service';
import {
  activeMemoryPredicate,
  unexpiredMemoryPredicate,
  workspaceMemoryPredicate,
} from '@/lib/services/managed-memory-context-service';

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleRestoreMemory(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) throw createError.validation('Choose a memory to restore');

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const [candidate] = await db.query<{ content: string }>(
    `select content from user_memories
      where id = $1::uuid and user_id = $2 and is_deleted = false
        and ${workspaceMemoryPredicate(3)}
      limit 1`,
    [id, userId, organizationId ?? null],
  );
  if (!candidate) throw createError.notFound('That memory is no longer waiting to be restored');
  await assertMemoryWriteAllowed(db, { userId, content: candidate.content });

  const [swap] = await db.query<{ restored: string | null; replaced: string | null }>(
    `with target as (
         select replaced.id, replaced.superseded_by as kept_id
           from user_memories replaced
           join user_memories kept
             on kept.id = replaced.superseded_by and kept.user_id = replaced.user_id
          where replaced.id = $1::uuid and replaced.user_id = $2
            and replaced.superseded_by is not null
            and ${unexpiredMemoryPredicate('replaced.')}
            and ${activeMemoryPredicate('kept.')}
            and ${workspaceMemoryPredicate(3, 'replaced.')}
       ), reinstated as (
         update user_memories as memory
            set superseded_by = null, superseded_at = null, updated_at = now()
           from target
          where memory.id = target.id and memory.user_id = $2
         returning memory.id::text as id
       ), demoted as (
         update user_memories as memory
            set superseded_by = target.id, superseded_at = now(), updated_at = now()
           from target
          where memory.id = target.kept_id and memory.user_id = $2
         returning memory.id::text as id
       )
       select (select id from reinstated) as restored, (select id from demoted) as replaced`,
    [id, userId, organizationId ?? null],
  );

  if (!swap?.restored || !swap.replaced) {
    throw createError.notFound('That memory is no longer waiting to be restored');
  }

  return NextResponse.json({
    restoredId: swap.restored,
    replacedId: swap.replaced,
  } satisfies ManagedMemoryRestoreResponse);
}

export const POST = withCorsRoute(withErrorHandler(handleRestoreMemory));

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 405 });
}
