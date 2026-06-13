/**
 * Knowledge File · soft-delete endpoint.
 *
 * DELETE /api/projects/[id]/knowledge-files/[fileId]
 *
 * Sets deleted_at to current timestamp (soft-delete). File must belong
 * to the project, which must belong to the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isSchemaNotReady(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

async function handleDeleteKnowledgeFile(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id: projectId, fileId } = await context.params;

  // Verify project ownership
  const [project] = await db.query<{ id: string }>(
    `select id from user_projects where id = $1 and user_id = $2 limit 1`,
    [projectId, userId],
  );

  if (!project) {
    throw createError.notFound('Project not found');
  }

  try {
    await db.execute(
      `update project_knowledge_files
       set deleted_at = now()
       where id = $1 and project_id = $2 and deleted_at is null`,
      [fileId, projectId],
    );
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return NextResponse.json(
        {
          error: 'knowledge_files_unavailable',
          message: 'Knowledge files require Cloud Managed (pending migration apply)',
        },
        { status: 503 },
      );
    }
    logger.error({ error, projectId, fileId }, 'Failed to delete knowledge file');
    throw createError.internal('Failed to delete knowledge file');
  }

  return NextResponse.json({ success: true });
}

export const DELETE = withErrorHandler(handleDeleteKnowledgeFile);
