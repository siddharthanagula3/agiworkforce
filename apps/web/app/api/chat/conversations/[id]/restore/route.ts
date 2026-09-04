import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withIsoTimestamps } from '@/lib/server/iso-timestamps';
import { type ChatConversationRow } from '@/lib/server/neon-chat';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

type RouteContext = { params: Promise<{ id: string }> };

async function handleRestoreConversation(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await context.params;

  let restored: ChatConversationRow | undefined;
  try {
    [restored] = await db.query<ChatConversationRow>(
      `
        update web_conversations
        set deleted_at = null
        where id = $1
          and user_id = $2
          and organization_id is not distinct from $3
          and deleted_at is not null
        returning id, title, model, project_id, pinned, starred, archived, is_temporary,
                  created_at, updated_at, deleted_at
      `,
      [id, userId, organizationId],
    );
  } catch (error) {
    logger.error({ error, conversationId: id }, 'Failed to restore conversation');
    throw createError.internal('Failed to restore conversation');
  }

  if (!restored) {
    throw createError.notFound('Conversation not found');
  }

  return NextResponse.json({ conversation: withIsoTimestamps([restored])[0] });
}

export const POST = withCorsRoute(withErrorHandler(handleRestoreConversation));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
