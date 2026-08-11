/**
 * Restore a soft-deleted conversation.
 *
 * POST /api/chat/conversations/[id]/restore
 *
 * `DELETE` on a conversation only sets `deleted_at`, and — unlike media, which
 * has `cron/purge-deleted-media` — nothing ever purges those rows. So a deleted
 * conversation was permanently unreachable while its messages sat in the
 * database indefinitely: the worst of both, no recovery for the user and no
 * reclaimed storage.
 *
 * This clears `deleted_at`. It deliberately does NOT touch `archived`,
 * `pinned`, or `starred`: restoring means putting the conversation back exactly
 * as it was, and an archived conversation that was then deleted should return
 * to being archived, not reappear in the main list.
 */

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withIsoTimestamps } from '@/lib/server/iso-timestamps';
import {
  getNeonChatDb,
  requireCurrentUserId,
  type ChatConversationRow,
} from '@/lib/server/neon-chat';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

type RouteContext = { params: Promise<{ id: string }> };

async function handleRestoreConversation(request: NextRequest, context: RouteContext) {
  const userId = await requireCurrentUserId(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await context.params;
  const db = getNeonChatDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);

  let restored: ChatConversationRow | undefined;
  try {
    // Owner-scoped and conditional on the row still being deleted. `returning`
    // distinguishes "restored it" from "there was nothing to restore" in one
    // statement, so a double-submit cannot report success twice.
    //
    // `updated_at` is deliberately NOT bumped: it drives the sidebar's ordering,
    // and restoring an old conversation should return it to its place in the
    // history rather than jumping it to the top as if it had new activity.
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
    // Covers both "not yours" and "not deleted" without disclosing which —
    // the same shape the rest of this route family uses.
    throw createError.notFound('Conversation not found');
  }

  return NextResponse.json({ conversation: withIsoTimestamps([restored])[0] });
}

export const POST = withCorsRoute(withErrorHandler(handleRestoreConversation));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
