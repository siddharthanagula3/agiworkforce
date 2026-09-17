import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  readProjectKnowledgeIndexStates,
  requestProjectKnowledgeReindex,
} from '@/lib/services/retrieval-index-service';
import { dispatchRetrievalIndexWorkflows } from '@/lib/workflows/start-retrieval-index-workflow';

const PG_UNDEFINED_TABLE = '42P01';

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

async function handleReindexKnowledgeFile(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id: projectId, fileId } = await context.params;

  const [file] = await db.query<{ file_name: string }>(
    `select f.file_name
       from project_knowledge_files f
       join user_projects p on p.id = f.project_id
      where f.id = $1
        and f.project_id = $2
        and f.deleted_at is null
        and f.superseded_at is null
        and p.user_id = $3
        and p.organization_id is not distinct from $4::uuid
        and p.is_archived = false
        and p.deleted_at is null
      limit 1`,
    [fileId, projectId, userId, organizationId],
  );
  if (!file) throw createError.notFound('Knowledge file not found');

  let documentId: string | null;
  try {
    documentId = await requestProjectKnowledgeReindex(db, {
      fileId,
      ownerUserId: userId,
      organizationId,
      fileName: file.file_name,
    });
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === PG_UNDEFINED_TABLE) {
      return NextResponse.json(
        { error: 'indexing_unavailable', message: 'Indexing is not available yet.' },
        { status: 503 },
      );
    }
    throw error;
  }
  if (!documentId) throw createError.internal('Indexing could not be requested');

  const dispatch = await dispatchRetrievalIndexWorkflows([{ documentId, userId, organizationId }]);
  const states = await readProjectKnowledgeIndexStates(db, projectId, [fileId]);

  return NextResponse.json(
    { indexing: states.get(fileId) ?? null, dispatched: dispatch.started > 0 },
    { status: 202 },
  );
}

export const POST = withCorsRoute(withErrorHandler(handleReindexKnowledgeFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
