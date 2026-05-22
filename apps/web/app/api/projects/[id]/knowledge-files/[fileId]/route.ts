/**
 * Knowledge File — soft-delete endpoint.
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
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

async function handleDeleteKnowledgeFile(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);
  const { id: projectId, fileId } = await context.params;

  // Verify project ownership
  const { data: project, error: projectError } = await supabase
    .from('user_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (projectError || !project) {
    throw createError.notFound('Project not found');
  }

  const { error } = await supabase
    .from('project_knowledge_files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fileId)
    .eq('project_id', projectId)
    .is('deleted_at', null);

  if (error) {
    logger.error({ error, projectId, fileId }, 'Failed to delete knowledge file');
    throw createError.internal('Failed to delete knowledge file');
  }

  return NextResponse.json({ success: true });
}

export const DELETE = withErrorHandler(handleDeleteKnowledgeFile);
