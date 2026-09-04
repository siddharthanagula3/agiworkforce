import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { killE2BSession } from '@/lib/e2b/runtime';
import { unpublishArtifactsForConversations } from '@/lib/services/published-artifact-service';
import { managedCloudE2BSessionScope } from '@/lib/e2b/session-store';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

const BulkConversationActionSchema = z.object({
  action: z.enum(['archive_all', 'delete_all', 'delete_archived']),
});

async function handleBulkConversationAction(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const parsed = BulkConversationActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid bulk conversation action', parsed.error);
  }

  const { action } = parsed.data;
  const isDelete = action !== 'archive_all';
  const archivedOnly = action === 'delete_archived';

  let affected: Array<{ id: string }>;
  try {
    affected = await db.query<{ id: string }>(
      isDelete
        ? `
            update web_conversations
               set deleted_at = now(), updated_at = now()
             where user_id = $1
               and organization_id is not distinct from $2
               and deleted_at is null
               ${archivedOnly ? 'and archived = true' : ''}
             returning id
          `
        : `
            update web_conversations
               set archived = true, updated_at = now()
             where user_id = $1
               and organization_id is not distinct from $2
               and deleted_at is null
               and archived = false
             returning id
          `,
      [userId, organizationId],
    );
  } catch (error) {
    logger.error({ error, userId, action }, 'Failed to apply bulk conversation action');
    throw createError.internal('Failed to update conversations');
  }

  if (isDelete) {
    // Soft delete leaves the 0095 FK cascade dormant, so a published artifact
    // would keep serving its public token after its chat is gone.
    try {
      const revoked = await unpublishArtifactsForConversations(db, {
        userId,
        conversationIds: affected.map(({ id }) => id),
      });
      if (revoked.length > 0) {
        logger.info(
          { userId, action, revoked: revoked.length },
          'Revoked published artifacts for bulk-deleted conversations',
        );
      }
    } catch (error) {
      logger.error(
        { error, userId, action },
        'Failed to revoke published artifacts during bulk conversation delete',
      );
      throw createError.internal('Failed to update conversations');
    }

    await Promise.all(
      affected.map(async ({ id }) => {
        try {
          await killE2BSession(managedCloudE2BSessionScope(userId, id));
        } catch (error) {
          logger.warn(
            { error, conversationId: id, userId },
            '[e2b] failed to release sandbox after bulk conversation delete',
          );
        }
      }),
    );
  }

  return NextResponse.json({ success: true, action, affectedCount: affected.length });
}

export const POST = withCorsRoute(withErrorHandler(handleBulkConversationAction));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
