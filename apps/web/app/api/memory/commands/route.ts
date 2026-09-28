import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { memoryCommandSource, runMemoryCommand } from '@/lib/services/memory-commands';
import {
  readManagedMemoryCommandRequest,
  type ManagedMemoryCommandResponse,
} from '@agiworkforce/types';
import { readSurfaceHint } from '@/lib/free-chat-surface-policy';
import { conversationHealthSpaceId } from '@/lib/services/health-space-service';

export const runtime = 'nodejs';

async function handleMemoryCommand(request: NextRequest): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Request body must be JSON');
  }

  const parsed = readManagedMemoryCommandRequest(rawBody);
  if (!parsed.ok) {
    throw createError.validation(parsed.message, { field: parsed.field });
  }

  const { db, userId, organizationId } = await getUserScopedDb(request);

  // Read from the conversation, never from the caller: a client that omitted
  // the flag must not be able to turn a temporary chat into a durable memory.
  const conversationId = parsed.request.conversationId ?? null;
  const [conversation] = conversationId
    ? await db.query<{ is_temporary: boolean }>(
        `select is_temporary from web_conversations where id = $1::uuid and user_id = $2 and deleted_at is null limit 1`,
        [conversationId, userId],
      )
    : [];
  const healthSpaceId = conversationId
    ? await conversationHealthSpaceId(db, userId, conversationId)
    : null;

  const result = await runMemoryCommand(
    db,
    {
      userId,
      organizationId,
      projectId: healthSpaceId ?? parsed.request.projectId ?? null,
      conversationId,
      temporaryChat: conversation?.is_temporary === true,
      source: memoryCommandSource(readSurfaceHint(request)),
    },
    { message: parsed.request.message, confirmed: parsed.request.confirmed ?? false },
  );

  if (!result) return NextResponse.json({ command: null } satisfies ManagedMemoryCommandResponse);

  if (result.kind === 'forget' && result.outcome.status === 'forgotten') {
    // Ids only. A trail that repeats the memory would outlive the deletion it
    // is recording, which is the opposite of what a forget was asked for.
    logger.info(
      {
        userId,
        organizationId,
        memoryIds: result.outcome.removed.map((memory) => memory.id),
      },
      '[memory-commands] explicit forget deleted memories',
    );
  }

  return NextResponse.json({
    command: { kind: result.kind, subject: result.command.subject },
    status: result.outcome.status,
    message: result.outcome.message,
    ...(result.kind === 'forget'
      ? {
          requiresConfirmation: result.outcome.status === 'confirmation_required',
          memories: result.outcome.removed,
        }
      : {}),
  } satisfies ManagedMemoryCommandResponse);
}

export const POST = withCorsRoute(withErrorHandler(handleMemoryCommand));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 405 });
}
