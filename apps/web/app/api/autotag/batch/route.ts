/**
 * Autotag Batch API
 *
 * POST /api/autotag/batch - Get tags for multiple conversations
 *
 * Looks up existing tags from conversation_tags table.
 * Returns 'general' for any conversation without a stored tag.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

async function handleBatchGetTags(request: NextRequest) {
  // AUDIT-008-006: Enforce CSRF protection for cookie-auth POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);

  let body: { conversationIds?: string[] };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const { conversationIds } = body;
  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    throw createError.validation('conversationIds must be a non-empty array');
  }

  // Cap at 100 to prevent abuse
  if (conversationIds.length > 100) {
    throw createError.validation('Maximum 100 conversation IDs per request');
  }

  // Validate all IDs are strings
  if (!conversationIds.every((id) => typeof id === 'string' && id.length > 0)) {
    throw createError.validation('All conversationIds must be non-empty strings');
  }

  // Fetch existing tags for this user's conversations
  let rows: { conversation_id: string; tag: string }[];
  try {
    rows = await db.query<{ conversation_id: string; tag: string }>(
      `select ct.conversation_id, ct.tag
         from conversation_tags ct
         join public.web_conversations c
           on c.id::text = ct.conversation_id
          and c.user_id = $1
          and c.organization_id is not distinct from $3::uuid
          and c.deleted_at is null
        where ct.user_id = $1
          and ct.conversation_id = any($2::text[])`,
      [userId, conversationIds, organizationId],
    );
  } catch (err) {
    logger.error({ err, userId }, 'Failed to fetch batch tags');
    throw createError.internal('Failed to fetch tags');
  }

  // Build result map, defaulting to 'general' for untagged conversations
  const tags: Record<string, string> = {};
  for (const id of conversationIds) {
    tags[id] = 'general';
  }
  for (const row of rows) {
    tags[row.conversation_id] = row.tag;
  }

  return NextResponse.json({ tags });
}

export const POST = withErrorHandler(handleBatchGetTags);
